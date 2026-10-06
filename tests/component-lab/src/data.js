export const base = [
  { id: 'R001', name: '张三', city: '上海', amount: '¥1,299.00', date: '2026-10-06', growth: '+18.3%' },
  { id: 'R002', name: '李四', city: '深圳', amount: '¥299.00', date: '2026-10-07', growth: '-2.0%' },
  { id: 'R003', name: '王五', city: '北京', amount: '¥1,500.00', date: '2026-10-08', growth: '0%' },
];
export const fields = ['name', 'city', 'amount', 'date', 'growth'];
export const labels = ['姓名', '城市', '金额', '日期', '增长'];
export function records(count) {
  return Array.from({ length: count }, (_, index) => ({ id: `R${String(index + 1).padStart(5, '0')}`, name: `商品 ${index + 1}`, city: '杭州', amount: `¥${index + 1}.00`, date: '2026-10-06', growth: '+1.0%' }));
}
export function ready() {
  requestAnimationFrame(() => requestAnimationFrame(() => { document.body.dataset.labReady = 'true'; }));
}
export const scenario = new URLSearchParams(location.search).get('case') ?? 'A1';
export const family = new URLSearchParams(location.search).get('family') ?? 'antd';
