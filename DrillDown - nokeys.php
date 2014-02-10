<?php
$mysql_host = "";
$mysql_user = "";
$mysql_password = "";
$mysql_database = "";

// Connecting, selecting database
$link = mysql_connect($mysql_host, $mysql_user, $mysql_password)
    or die('Could not connect: ' . mysql_error());
mysql_select_db($mysql_database) or die('Could not select database');
mysql_set_charset('utf8',$link);

$groupBy    = $_GET['groupBy']; 
$measures   = $_GET['measures']; 
$filters    = $_GET['filters']; 
$filterCols = $_GET['filterCols'];
$order      = $_GET['order'];
$columns    = $_GET['cols']; 
$table      = $_GET['tab'];
$q          = $_GET['q'];

switch ($q) {
  case 'group':
    // Do a group by query.
    $columns = $groupBy;
    $dummy = '';
    if (strlen($filterCols) > 0) {
      // There are filters, add them to the where clause and 
      // the list of requested columns.
      $where = ' WHERE ' . $filters;
      $dummy = ',' . $filterCols;
    }
    $orderBy = '';
    if (strlen($order) > 0 ) {
      // Request to sort.
      $orderBy = " order by " . $order;
    }
   
    $query = "SELECT $groupBy, $measures $dummy 
       FROM  $table
       $where
       GROUP BY  $groupBy $dummy
       $orderBy";
  break;

  case 'count':
    // Do a query to count unique values of a list of columns.
    $countDim = $_GET['countDim'];
    if (strlen($filters) > 0) {
      // There are filters, create a where clause.
      $where = ' WHERE ' . $filters;
    }
    $query = "SELECT $countDim
      FROM $table
      $where";
    break;

  case 'all':
    // Do a simple select on a table.
    $limit = $_GET['limit'];
    $offset = $_GET['offset'];
    $where = '';
    if (strlen($filters) > 0) {
      $where = " where " . $filters;
    }
    if (!$columns || $columns == "`*`") {
      // No list of columns was provided, so get them all.
      $columns = "*";
    }
    $query = "SELECT $columns FROM $table $where";
    if (strlen($limit)) { $query .= " LIMIT $limit"; }
    if (strlen($offset)) { $query .= " OFFSET $offset"; }
    break;
}

// Performing SQL query
file_put_contents ("/tmp/mysqllog.txt", $query . "\n", FILE_APPEND);
$result = mysql_query($query) or die('Query failed: ' . mysql_error());

// First line has the headers.
for($i = 0; $i < mysql_num_fields($result); $i++) {
    $field_info = mysql_fetch_field($result, $i);
    echo "{$field_info->name}\t";
}
echo "\n";

// Print rows.
while ($line = mysql_fetch_array($result, MYSQL_ASSOC)) {
    foreach ($line as $col_value) {
        echo "$col_value\t";
    }
    echo "\n";
}

// Free resultset
mysql_free_result($result);

// Closing connection
mysql_close($link);
?>

