drop table if exists drilldown_info;
create table drilldown_info 
(
  table_name varchar(255),
  dimensions varchar(255),
  measures varchar(255),
  detail_columns varchar(255)
);

insert into drilldown_info
(table_name, dimensions, measures, detail_columns)
values 
( 'olympics'
  , 'country,year,sport,event,medal'
  , 'medals'
  , '*'
);


