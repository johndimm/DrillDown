/*
 * Copyright 2013, 2014, 2015, 2016, 2017, 2018, 2019 John Dimm -- All Rights Reserved
 * You may use, distribute and modify this code under the
 * terms of the MIT license.
 */

var drillDown;
var DEFAULT_LIMIT = 25;
var DEFAULT_SORT_MEASURE = 0;

$(document).ready(function() {
  drillDown = new DrillDown();
  drillDown.getDataSources();
});

function escapeForSQL(str) {
  return str.replace(/'/g, "\\'\\'").replace(/&/g, "\&");
}

function sprintf(format, vars) {
  for (var i=0;i<vars.length;i++) {
    format = format.replace("%s", vars[i]);
  }
  return format;
}

function addCommas(x) {
    if (x != null)
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function compareInt (a,b,direction) { 
  var ia = Math.floor(a);
  var ib = Math.floor(b);
  return (direction == 1) ? a - b : b - a;
}

function compareString (a,b,direction) { 
  return (direction == 1) ? a.localeCompare(b) : b.localeCompare(a);
}

var DrillDown = function () {

  this.idxSource = 0;
  this.tableInfo = [];
  this.sortColumn = 3;
  this.sortDirection = 1;
  this.detailLimit = DEFAULT_LIMIT;
  this.detailOffset = 0;

  this.Init = function () {

    var selDataSource = '';
    if (this.tableInfo.length > 1) {
      selDataSource = 'Cubes: ';
      // If there are more than 1 data sources, display links to switch.
      for (var i=0;i<this.tableInfo.length;i++) {
         selDataSource += sprintf("<span id='dataSource_%s' class='dsNormal' onclick='javascript:drillDown.changeDataSource(%s);'>", [i,i]);
         selDataSource +=  this.tableInfo[i].table;
         selDataSource += "</span>";
      }
    $("#dataSource").html(selDataSource);
    }

    this.setDataSource(0);
    this.displayDimensions();
    this.getCounts();
    this.breakDown();
  }

  this.addDataSource = function (table, dimensions, measures, detailColumns, page_title) {
    var info = new Object;
    info.table = table;
    info.dims = dimensions;
    info.detailColumns = detailColumns;
    info.measures = measures;
    info.page_title = page_title;
    this.tableInfo.push(info);
  }

  this.groupBy = 0;
  this.filters = new Object;


  this.setDataSource = function (idx) {
    $("#dataSource_" + this.idxSource).attr("class", "dsNormal");
    this.idxSource = idx;
    this.tab = this.tableInfo[idx].table + "_summary";
    this.dimensions = this.tableInfo[idx].dims;
    this.detailCols = this.tableInfo[idx].detailColumns;
    this.measures = this.tableInfo[idx].measures;
    $("#dataSource_" + idx).attr("class", "dsSelected")
    $("#page_title").html(this.tableInfo[idx].page_title);
    window.document.title = this.tableInfo[idx].page_title;
  }

  this.changeDataSource = function (idx) {
    this.setDataSource(idx);
    this.filters = new Object;
    this.groupBy = 0;
    this.displayDimensions();
    this.getCounts();
    this.breakDown();
  }

  this.getCols = function () {
    var cols = [];
    for (var i = 0; i < this.detailCols.length; i++){
      cols.push("`"+this.detailCols[i]+"`");
    }
    return cols.join(',');
  }
  
  this.getFilterCols = function () {
    var keys = Object.keys(this.filters);
    var dims = [];
    for (var i = 0; i < keys.length; i++) {
      dims.push("`"+this.dimensions[keys[i]]+"`");
    }
    return dims.join(',');
  }

  this.getMeasureCols = function () {
    var sums = [];
    for (var i=0;i<this.measures.length;i++) {
      sums.push('sum(`' + this.measures[i] + '`)');
    }
    return sums.join(',');
  }

  this.getFilterSel = function () {
    var result = '';
    var keys = Object.keys(this.filters);
    for (var i = 0; i < keys.length; i++) {
      if (i > 0) result += " AND ";
      var eqVal = "='" + this.filters[keys[i]] + "'";
      //var eqVal = "='" + this.filters[keys[i]] + "'";
      if (this.filters[keys[i]] == '') eqVal = " is null ";
      result += "`" + this.dimensions[keys[i]] + "`" + eqVal;
    }
    return result;
  }

  this.setDim = function (i) {
    this.groupBy = i;
    this.breakDown();
  }

  this.displayDimensions = function () {
    var result = '';
    for (var i = 0; i < this.dimensions.length; i++) {
      var dim = this.dimensions[i];

      var template = "<div class='dimension'>"
      + "<div class='futureDim' onclick='drillDown.setDim(%s)' id='dimName_%s'>%s</div>"
      + "<div class='countDim' id='count_%s'></div>"
      + "<div class='removeSel' id='sel_%s' title='Remove this filter'></div></div>";
      result += sprintf(template, [i,i,dim,i,i]);
      
    }
    $("#dimensions").html(result);
  }

  this.removeSelection = function (j) {
    delete this.filters[j];
    this.groupBy = j;
    $("#sel_" + j).text('');
    this.getCounts();
    this.breakDown();
  }

  this.receiveData = function (data, keepFirstRow) {
    var dataRows = data.split("\n");
    var rows = [];
    var i = keepFirstRow ? 0 : 1;
    for (; i < dataRows.length; i++) {
      if (dataRows[i].length > 0) {
        var row = new Object;
        row.cols = dataRows[i].split("\t");
        rows.push(row);
      }
    }
    return rows;
  }

  this.sortData = function (sortColumn, isInt) {
    if (sortColumn == this.sortColumn)  this.sortDirection *= -1;
    this.sortColumn = sortColumn;
    var compareFunc = compareString;
    if (isInt) compareFunc = compareInt;
    var me = this;
    this.rows.sort(function(a,b) { return compareFunc(a.cols[sortColumn],
                                                      b.cols[sortColumn], me.sortDirection);} );
    this.displaySummary(this.rows);
  }

  this.selectItemLink = function(idx, str, inc) {
     if (inc == null) inc = 0;
     var qstr = '\'' + escapeForSQL(str) + '\'';
     var link = sprintf("\"javascript:drillDown.selectItem(%s,%s,%s)\"", [idx, qstr, inc]);
     return link;
  }


  this.selectItem = function (j, cellVal, inc) {
    var displayCellVal = cellVal.replace(/''/g, "'");
    var onClick = "drillDown.removeSelection(" + j + ");";
    $("#sel_" + j).text(displayCellVal).attr("onclick",onClick);
    this.filters[j] = cellVal;

    if (!inc) inc = 0;
    this.groupBy = (this.groupBy + inc) % this.dimensions.length;

    this.getCounts();
    this.breakDown();
  }

  this.displayDetail = function (rows) {
    var result = '';
    result += '<table cellspacing=0 cellpadding=5>';
    var headers = rows[0];
    for (var i = 0; i < rows.length; i++) {
      result += "<tr>";
      var start = "<td>";
      var end = "</td>";
      if (i == 0) {
        start = "<th>"
        end = "</th>"
      }

      // Last column is the extra tab at the end, placed by the php script.
      for (var j = 0; j < rows[i].cols.length - 1; j++) {
          var cellVal = rows[i].cols[j];
          var dim = this.dimensions.indexOf(headers.cols[j]);
          if (dim != -1 && i>0) {
             var link = this.selectItemLink(dim, cellVal, 0);
             cellVal = sprintf("<a title='restrict %s to %s' href=%s>%s</a>",
               [headers.cols[j], cellVal, link, cellVal]);
          }
          if (cellVal.indexOf('http://') == 0) cellVal = sprintf("<a href='%s'>%s</a>", [cellVal, cellVal]);
          if (cellVal == '') cellVal = '&nbsp;';
          result += start + cellVal + end;
      }
      result += "</tr>";
    }
    result += "</table>";
    $("#detail").html(result);
  }

  this.displaySummary = function (rows) {
    // Update colors for dim selectors on the left, using 
    // css classes futureDim, filterDim, and breakDim.
    for (var i = 0; i < this.dimensions.length; i++) {
      $("#dimName_" + i).attr('class', 'futureDim');
    }
    var filterKeys = Object.keys(this.filters);
    for (var i = 0; i < filterKeys.length; i++) {
      if (filterKeys[i]) 
      $("#dimName_" + filterKeys[i]).attr('class', 'filterDim');
    }
    $("#dimName_" + this.groupBy).attr('class', 'breakDim');

    // Scan for graph.
    var totalMeasure = [];
    var maxMeasures = [];
    for (var j=0;j<this.measures.length;j++) {
      totalMeasure.push(0);
      maxMeasures.push(0);
    }

    // The column index in rows for the sort.
    var idxSortMeasure = DEFAULT_SORT_MEASURE + 1;
 
    for (var i=0; i< rows.length; i++) {
      for (var j=0;j<this.measures.length; j++) {
        var m = Math.floor(rows[i].cols[j+1]);
        if (m) {
          totalMeasure[j] += m;
          maxMeasures[j] = Math.max(maxMeasures[j], m);
        }
      }
    }

    // Measures start at column 2 of rows, after break column.
    var maxMeasure = maxMeasures[idxSortMeasure-1];

    // Compose an HTML table in a buffer.
    var result = '';
    result += '<table cellspacing=0 cellpadding=5>';
    result += sprintf("<tr><th id='col_0' class='breakHeader' onclick='drillDown.sortData(0,false);'>%s</th><th width=200></th>", 
      [this.dimensions[this.groupBy]]);
    for (var i = 0; i < this.measures.length; i++) {
      result += sprintf("<th id='col_%s' class='measureHeader' onclick='drillDown.sortData(%s,true);'>%s</th>", 
      [(i+1),(i+1),this.measures[i]]);
    }
    result += "</tr>";

    console.log('rows:' + rows.length);
    // First line has headers.
    for (var i = 0; i < rows.length; i++) {
      result += "<tr>";

      // 1. Show breakdown column.
      j = 0;
      var cellVal = rows[i].cols[j];
      var link = this.selectItemLink(this.groupBy, cellVal, 1);
      var onClick = sprintf("onclick=%s", [link]);
      console.log(onClick);
      displayVal = sprintf("<div id='item_%s' class='breakCol' %s>%s</div>", [i, onClick, cellVal]);
      console.log(displayVal);

      result += "<td>" + displayVal + "</td>";

      // 2.  Show graph.
      var thisTUs = rows[i].cols[idxSortMeasure];
      var pc = Math.floor((thisTUs * 100) / maxMeasure);
      var graph = "<div style='background-color:gray;cursor:pointer;width:" + pc + "%'>&nbsp</div>";
      result += "<td " + onClick + ">" + graph + "</td>";

      // 3.  Show measures.
      for (var j = 1; j < this.measures.length + 1; j++) {
        var cellVal = rows[i].cols[j];
        cellVal = addCommas(cellVal);
        if (cellVal == '') cellVal = '&nbsp;';
        result += "<td class='measure'>" + cellVal + "</td>";
      }

      result += "</tr>";
    }

    result += "<tr><td></td><td>Totals</td>";
    for (var i=0;i<this.measures.length;i++) {
      result += "<td class='measure'>" + addCommas(String(totalMeasure[i])) + "</td>";
    }
    result += "</tr>";
    result += "</table>";
    $("#list").html(result);
  }

  this.breakDown = function () {
    var groupByName = "`"+this.dimensions[this.groupBy]+"`";
    this.getSummary(groupByName);
//    this.detailLimit = DEFAULT_LIMIT;
    this.detailOffset = 0;
    this.getDetail();
  }

  this.getDataSources = function() {
    var p = {};
    p.cols = 'table_name, dimensions, measures, detail_columns, page_title';
    p.tab = 'drilldown_info';
    p.q = 'all';
    var me = this;

    $.ajax({
      url: 'DrillDown.php',
      data: p,
      type: "GET",
      success: function (data) {
        var lines = data.split('\n');
        // First line is headers.
        for (var i=1; i<lines.length; i++) {
          if (lines[i].length > 0) {
            var cols = lines[i].split('\t');

            // Assume 5 columns.
            var table_name = cols[0];

            // Remove spaces around field names.
            var dimensions = cols[1].split(/\s*,\s*/);
            var measures = cols[2].split(/\s*,\s*/);
            var detail_columns = cols[3].split(/\s*,\s*/);
            var page_title = cols[4];
            me.addDataSource(table_name, dimensions, measures, detail_columns, page_title);
          }
        }
        me.Init();
      }
    });
  }

  this.prevNextDim = function (i) {
    // Remmeber values.
    var dimValue = this.filters[i];
  
    // Reset them temporarily.
    delete this.filters[i];

    var requestStr = "DrillDown.php";

    var p = {};
    p.groupBy = "`" + this.dimensions[i] + "`";
    p.filters = this.getFilterSel();
    p.filterCols = this.getFilterCols();

    // Restore filters.
    if (dimValue) 
      this.filters[i] = dimValue;

    p.measures = this.getMeasureCols();
    p.tab = this.tab;
    p.order =  p.groupBy;
    p.q = 'group';

    var me = this;

    // Get summary data.
    $.ajax({
      url: requestStr,
      data: p,
      type: "GET",
      cache: true,
      success: function (data) {
        var rows = me.receiveData(data, false);
        // Find prev and next value to the currently selected on.
        var idx = -1;
        for (var j=0;j<rows.length; j++) {
          if (rows[j].cols[0] == dimValue) {
            idx = j;
            break;
          } 
        }
        var prev = 'prev';
        if (idx > 0 && rows[idx-1].cols[0] != '') {
          var prevDimVal = rows[idx-1].cols[0];
          var link = this.selectItemLink(i, prevDimVal, 0);
          prev = sprintf ("<a title='%s' href=%s>prev</a>",[prevDimVal, link]);
        }
        var next = 'next';
        if (idx > -1 && idx < rows.length - 1 && rows[idx+1].cols[0] != '') {
          var nextDimVal = rows[idx+1].cols[0];
          var link = this.selectItemLink(i, nextDimVal, 0);
          next = sprintf ('<a title=\'%s\' href=%s>next</a>',[nextDimVal, link]);
        }

        var prevNext = '';
        if (prev != 'prev' || next != 'next') 
          var prevNext = sprintf("%s | %s",[prev,next]);;
        $("#count_" + i).html(prevNext);
      }.bind(this)
    });

  }

  this.getCounts = function () {
    var requestStr = 'DrillDown.php';
    var p = {};
    p.countDim = '';
    for (var i = 0; i < this.dimensions.length; i++) {
      if (i > 0) p.countDim += ",";
      p.countDim += "count(distinct(`" + this.dimensions[i] + "`))";
    }
    p.filters = this.getFilterSel();
    p.tab = this.tab;
    p.q = 'count';
    var me = this;

    $.ajax({
      url: requestStr,
      data: p,
      type: "GET",
      cache: true,
      success: function (data) {
        lines = data.split('\n');
        if (lines.length <= 1) return;
        me.dimCounts = lines[1].split('\t');
        for (var i = 0; i < me.dimCounts.length; i++) {
          var newCount = me.dimCounts[i];
          if (newCount == 1) {
            me.prevNextDim(i);
          } else {
            $("#count_" + i).text(newCount);
          }
        }
      }
    });
  }

  this.getSummary = function (groupByName) {
    var requestStr = "DrillDown.php";

    var p = {};
    p.groupBy = groupByName;
    p.filters = this.getFilterSel();
    p.filterCols = this.getFilterCols();
    p.measures = this.getMeasureCols();
    p.tab = this.tab;
    p.order = 'sum(`' + this.measures[DEFAULT_SORT_MEASURE] + '`) DESC';
    p.q = 'group';

    var me = this;

    // Get summary data.
    $.ajax({
      url: requestStr,
      data: p,
      type: "GET",
      cache: true,
      success: function (data) {
        me.rows = me.receiveData(data, false);
        me.displaySummary(me.rows);
      }
    });
  }

  this.getDetail = function () {
    var requestStr = "DrillDown.php";

    var p = {};
    p.filters = this.getFilterSel();
    p.filterCols = this.getFilterCols();
    p.tab = this.tab.replace("_summary","_fact");

    //p.filters = p.filters.replace('year','year(date)');
    //p.filtersCols = p.filterCols.replace('year', 'year(date)');

    p.cols = this.getCols();
    p.limit = this.detailLimit;
    p.offset = this.detailOffset;
    p.q = 'all';

    var me = this;

    $.ajax({
      url: requestStr,
      data: p,
      type: "GET",
      cache: true,
      success: function (data) {
        var rows = me.receiveData(data, true);
        me.displayDetail(rows);
      }
    });

  }

  this.hideSummary = function() {
    $("#dimensions").css("display", "none");
    $("#list").css("display", "none");
    $("#backButton").css("display", "block");
  }

  this.showSummary = function() {
    $("#dimensions").css("display", "block");
    $("#list").css("display", "block");
    $("#backButton").css("display", "none");
  }

  this.prevDetailPage = function () {
    this.hideSummary();
    this.detailOffset -= this.detailLimit;
    this.detailOffset = Math.max(0, this.detailOffset);
    this.getDetail();
  }

  this.nextDetailPage = function () {
    this.hideSummary();
    this.detailOffset += this.detailLimit;
    this.getDetail();
  }
}

