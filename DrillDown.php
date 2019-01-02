<?php

function getParam($paramName, $defaultValue) {
    return isset($_GET[$paramName])
      ? $_GET[$paramName]
      : $defaultValue;
}

function connect() {
    include 'mysql_connect.php';
    $charset = 'utf8mb4';

    $dsn = "mysql:host=$mysql_host;dbname=$mysql_database;charset=$charset";
    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ];
    try {
         $pdo = new PDO($dsn, $mysql_user, $mysql_password, $options);
    } catch (\PDOException $e) {
         throw new \PDOException($e->getMessage(), (int)$e->getCode());
    }
    return $pdo;
}


function constructSQLQuery() {
    $groupBy    = getParam('groupBy','');
    $measures   = getParam('measures','');
    $filters    = getParam('filters','');
    $filterCols = getParam('filterCols','');
    $order      = getParam('order','');
    $columns    = getParam('cols','table_name, dimensions, measures, detail_columns');
    $table      = getParam('tab','drilldown_info');
    $q          = getParam('q','all');

    $where = '';

    switch ($q) {
      case 'group':
        $columns = $groupBy;
        $filterList = '';

        // Where clause.
        if (strlen($filterCols) > 0) {
          // There are filters, add them to the where clause and
          // the list of requested columns.
          $where = ' WHERE ' . $filters;
          $filterList = ',' . $filterCols;
        }

        // Sort.
        $orderBy = '';
        if (strlen($order) > 0 ) {
          $orderBy = " order by " . $order;
        }

        $query = "SELECT $groupBy, $measures $filterList
           FROM  $table
           $where
           GROUP BY  $groupBy $filterList
           $orderBy";

      break;

      case 'count':
        // Count unique values of a list of columns.
        $countDim = getParam('countDim','');
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
        $limit = getParam('limit','');
        $offset = getParam('offset','');
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
    return $query;
}

function printSQLResults ($result) {
  $rows = '';
  $header = '';
    
  while($row = $result->fetch(PDO::FETCH_ASSOC)) {
     if ($header == '') {
       foreach (array_keys($row) as &$key) {
         $header .=  $key . "\t";
       }
       $header .= "\n";
     }

      foreach ($row as &$col) {
          $rows .= "$col\t";
      }
      $rows .= "\n";
  }

  echo $header;
  echo $rows;
}

function main() {
    // Get ready.
    $pdo = connect();
    $query = constructSQLQuery();

    // Log SQL query.
    // file_put_contents ("/tmp/mysqllog.txt", $query . "\n", FILE_APPEND);

    // Perform SQL query.
    $result = $pdo->query($query) or die('Query failed: ' . mysql_error());
    printSQLResults($result);

    // Close connection.
    $pdo = null;
}

main();
?>

