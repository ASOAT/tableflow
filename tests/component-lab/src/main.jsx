import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Table } from 'antd';
import { DataGrid, useGridApiRef } from '@mui/x-data-grid';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { base, fields, labels, records, ready, family, scenario } from './data';
import './style.css';

ModuleRegistry.registerModules([AllCommunityModule]);
function AntLab() {
  const [selected, setSelected] = useState(['R002']);
  const [expanded, setExpanded] = useState(['R001']);
  const perf = scenario.startsWith('P');
  const count = perf ? Number(scenario.slice(1)) : scenario === 'A2' ? 120 : scenario === 'A3' ? 60 : 3;
  const data = scenario === 'A11' ? [] : count === 3 ? base : records(count);
  let columns = fields.map((field, index) => ({ title: labels[index], dataIndex: field, key: field, width: 180 }));
  if (['A4', 'A5'].includes(scenario)) columns[0].fixed = 'left';
  if (scenario === 'A5') columns[4].fixed = 'right';
  if (scenario === 'A9') columns = [columns[0], { title: '基本信息', children: [columns[1], columns[2]] }, { title: '趋势', children: [columns[3], columns[4]] }];
  if (perf) columns = Array.from({length:20}, (_, index) => ({ title: `列 ${index + 1}`, key: `c${index}`, dataIndex: index === 0 ? 'id' : 'name', width: 95 }));
  useEffect(ready, []);
  return <Table rowKey="id" dataSource={data} columns={columns}
    pagination={scenario === 'A2' ? { total: 120, pageSize: 20, showTotal: total => `总计 ${total} 条`, showSizeChanger: false } : false}
    scroll={['A3','A4','A5','A6'].includes(scenario) ? { x: 1100, y: scenario === 'A3' ? 220 : undefined } : undefined}
    rowSelection={scenario === 'A7' ? { selectedRowKeys: selected, onChange: setSelected } : undefined}
    expandable={scenario === 'A8' ? { expandedRowKeys: expanded, onExpandedRowsChange: setExpanded, expandedRowRender: () => <p>商品包装说明，非表格数据。</p> } : undefined}
    summary={scenario === 'A10' ? () => <Table.Summary><Table.Summary.Row><Table.Summary.Cell index={0}>合计</Table.Summary.Cell><Table.Summary.Cell index={1}></Table.Summary.Cell><Table.Summary.Cell index={2}>¥3,098.00</Table.Summary.Cell><Table.Summary.Cell index={3}></Table.Summary.Cell><Table.Summary.Cell index={4}></Table.Summary.Cell></Table.Summary.Row></Table.Summary> : undefined}
  />;
}

function MuiLab() {
  const apiRef = useGridApiRef();
  const count = ['M2','M3'].includes(scenario) ? (scenario === 'M2' ? 120 : 80) : scenario === 'M10' ? 10000 : 3;
  const data = count === 3 ? base : records(count);
  const wide = scenario === 'M4';
  let columns = fields.map((field, index) => ({ field, headerName: labels[index], width: 175 }));
  if (scenario === 'M7') columns[0].sortComparator = (a,b) => a > b ? 1 : a < b ? -1 : 0;
  if (['M3','M10'].includes(scenario)) columns = [{field:'id',headerName:'编号',width:170},{field:'name',headerName:'姓名',width:170},{field:'city',headerName:'城市',width:170}];
  if (wide) columns = Array.from({length:20},(_,index)=>({field:index===0?'id':`c${index}`,headerName:`列 ${index+1}`,width:160,valueGetter: (_value,row)=> index===0?row.id:row.name}));
  useEffect(() => { ready(); }, []);
  return <div>{scenario === 'M6' && <p id="community-limit">MUI Data Grid Community 不提供 column pinning；没有安装 Pro / Premium。</p>}<div style={{height: ['M3','M10'].includes(scenario) ? 280 : 450, width: wide ? 550 : 1000}}><DataGrid apiRef={apiRef} rows={data} columns={columns}
    rowHeight={32} columnHeaderHeight={36} rowBufferPx={32} columnBufferPx={0}
    checkboxSelection={scenario === 'M5'}
    initialState={{ pagination:{paginationModel:{page:0,pageSize:scenario==='M2'?20:100}}, sorting:{sortModel:scenario==='M7'?[{field:'name',sort:'desc'}]:[]}, filter:{filterModel:scenario==='M8'?{items:[{field:'city',operator:'equals',value:'上海'}]}:{items:[]}} }}
    pageSizeOptions={[20,100]} onStateChange={() => { window.__labComponentState = {family,scenario,pinningAvailable:typeof apiRef.current?.setPinnedColumns === 'function'}; }}
  /></div></div>;
}

function AgLab() {
  const [count,setCount] = useState(scenario === 'G2' ? 120 : scenario === 'G3' ? 1000 : scenario === 'P10000' ? 10000 : 3);
  useEffect(()=>{const grow=()=>setCount(value=>value+10);window.addEventListener('lab-grow',grow);return()=>window.removeEventListener('lab-grow',grow);},[]);
  const data = count === 3 ? base : records(count);
  const wide = scenario === 'G4';
  let columns = fields.map((field,index)=>({field,headerName:labels[index],width:175,sortable:true,filter:true}));
  if (['G2','G3','P10000'].includes(scenario)) columns = [{field:'id',headerName:'编号',width:170},{field:'name',headerName:'姓名',width:170},{field:'city',headerName:'城市',width:170}];
  if (wide) columns = Array.from({length:20},(_,index)=>({field:index===0?'id':`c${index}`,headerName:`列 ${index+1}`,width:160,valueGetter: params=>index===0?params.data.id:params.data.name}));
  if (scenario === 'G5') columns[0].pinned='left';
  if (scenario === 'G6') columns[4].pinned='right';
  if (scenario === 'G7') columns[0].sort='desc';
  if (scenario === 'G7') columns[0].comparator=(a,b)=>a>b?1:a<b?-1:0;
  if (scenario === 'G10') columns[0].cellRenderer= params=><span><a href="#value">{params.value}</a><span aria-hidden="true">辅助图标</span></span>;
  if (scenario === 'G11') columns[4].hide=true;
  return <div style={{height:280,width:wide?550:1000}}><AgGridReact theme={themeQuartz} rowData={data} columnDefs={columns}
    getRowId={params=>params.data.id} rowHeight={32} headerHeight={36} rowBuffer={1} defaultColDef={{cellDataType:false}} animateRows={false}
    onFirstDataRendered={params=> { window.__labComponentState={family,scenario}; if(scenario==='G8') { params.api.setFilterModel({city:{filterType:'text',type:'equals',filter:'上海'}}); params.api.onFilterChanged(); } else ready(); }}
    onFilterChanged={params=>{if(scenario==='G8' && params.api.getDisplayedRowCount()===1)ready();}}
  /></div>;
}

function App() {
  const [mounted,setMounted]=useState(true);
  return <main><h1>{family} · {scenario}</h1><p>官方组件，本地合成数据，生产扩展不包含这些依赖。</p><button id="focus-sentinel">焦点保留测试</button><button id="unmount" onClick={()=>setMounted(false)}>卸载组件</button><button id="grow-rows" onClick={()=>window.dispatchEvent(new Event('lab-grow'))}>追加 10 行</button><section id="component-surface">{mounted && (family==='antd'?<AntLab/>:family==='mui'?<MuiLab/>:<AgLab/>)}</section></main>;
}
if(family==='element-plus') import('./element.js').then(module=>module.mountElement());
else createRoot(document.getElementById('root')).render(<App/>);
