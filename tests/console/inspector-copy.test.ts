import {expect,it} from 'vitest';
import {businessExpression,sourceTableLabel} from '../../apps/console/src/inspector-copy.js';
import {validSnapshot} from '../fixtures-v3.js';
it('renders metric and physical field references as business names while preserving literal values',()=>{
 const s=validSnapshot();
 expect(businessExpression('(m_sales-m_cost)/NULLIF(m_sales, 0)',s,'o_order')).toBe('(【销售额】-【成本额】)/空值保护(【销售额】, 0)');
 expect(businessExpression("SUM(orders.sales) + SUM(`orders`.`cost`) + 'm_sales'",s,'o_order')).toBe("求和(【销售金额】) + 求和(【成本金额】) + 'm_sales'");
 expect(businessExpression('unknown_m_sales',s,'o_order')).toBe('unknown_m_sales');
 expect(sourceTableLabel('selectdb:long_table_name')).toBe('long_table_name');
});
