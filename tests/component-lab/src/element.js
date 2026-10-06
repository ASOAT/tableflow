import { createApp, h, ref, onMounted, nextTick } from 'vue';
import { ElTable, ElTableColumn, ElPagination } from 'element-plus';
import 'element-plus/dist/index.css';
import { base, fields, labels, records, ready, scenario } from './data';

export function mountElement() {
  createApp({setup(){
    const table = ref();
    const page = ref(1);
    const mounted = ref(true);
    const data = scenario==='E10'?records(120):base;
    onMounted(()=>nextTick(()=>{ if(scenario==='E4') table.value.toggleRowSelection(base[1],true); ready(); }));
    const columns=()=>{
      const controls=[];
      if(scenario==='E4') controls.push(h(ElTableColumn,{type:'selection',width:50}));
      if(scenario==='E5') controls.push(h(ElTableColumn,{type:'expand',width:50},{default:()=>h('p','包装说明，非业务数据行。')}));
      const plain=fields.map((field,index)=>h(ElTableColumn,{prop:field,label:labels[index],width:180,sortable:scenario==='E8',fixed:scenario==='E2'&&index===0?'left':scenario==='E3'&&index===4?'right':undefined}));
      if(scenario==='E6') return [plain[0],h(ElTableColumn,{label:'基本信息'},{default:()=>[plain[1],plain[2]]}),h(ElTableColumn,{label:'趋势'},{default:()=>[plain[3],plain[4]]})];
      return [...controls,...plain];
    };
    return ()=>h('main',[
      h('h1',`element-plus · ${scenario}`),h('p','真实 Vue / ElTable，所有数据只在本地。'),h('button',{id:'focus-sentinel'},'焦点保留测试'),h('button',{id:'unmount',onClick:()=>mounted.value=false},'卸载组件'),
      h('section',{id:'component-surface',style:{width:scenario==='E9'?'650px':'1000px'}},mounted.value?[h(ElTable,{ref:table,data:scenario==='E10'?data.slice((page.value-1)*20,page.value*20):data,rowKey:'id',border:true,showSummary:scenario==='E7',summaryMethod:()=>['合计','','¥3,098.00','',''],expandRowKeys:scenario==='E5'?['R001']:[],defaultSort:scenario==='E8'?{prop:'name',order:'descending'}:undefined},{default:columns})]:[]),
      scenario==='E10'?h(ElPagination,{total:120,pageSize:20,currentPage:page.value,layout:'total, prev, pager, next','onUpdate:currentPage':value=>page.value=value}):null
    ]);
  }}).mount('#root');
}
