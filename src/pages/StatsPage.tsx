import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import type { ArcData } from '../types';
import { monthKey, todayTaipei, yearKey } from '../utils/date';
import { formatMoney } from '../utils/number';

interface HandlerTotalRow {
  year: string;
  month?: string;
  handler: string;
  count: number;
}

interface ItemStatRow {
  itemName: string;
  monthCount: number;
  yearCount: number;
}

interface BrokerStatRow {
  brokerName: string;
  monthCount: number;
  yearCount: number;
  totalCount: number;
}

interface YearMonthRow {
  year: string;
  months: number[];
  total: number;
}

interface YearMonthAmountRow {
  year: string;
  months: number[];
  total: number;
}

export function StatsPage({ data }: { data: ArcData }) {
  const currentMonth = todayTaipei().slice(5, 7);
  const currentYear = todayTaipei().slice(0, 4);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const statCases = useMemo(() => data.cases.filter((caseRow) => {
    const item = data.applicationItems.find((entry) => entry.id === caseRow.application_item_id);
    return item?.included_in_stats && caseRow.status !== 'cancelled';
  }), [data.applicationItems, data.cases]);

  const years = useMemo(() => {
    const values = Array.from(new Set([...statCases.map((item) => yearKey(item.application_date)), currentYear].filter(Boolean))).sort().reverse();
    return values.length ? values : [currentYear];
  }, [currentYear, statCases]);

  const selectedMonthKey = `${year}-${month}`;

  const monthlyHandlerRows = useMemo(() => {
    const map = new Map<string, HandlerTotalRow>();
    statCases
      .filter((caseRow) => monthKey(caseRow.application_date) === selectedMonthKey)
      .forEach((caseRow) => {
        const key = `${year}|${month}|${caseRow.handler_name}`;
        const row = map.get(key) ?? { year, month, handler: caseRow.handler_name, count: 0 };
        row.count += 1;
        map.set(key, row);
      });
    return Array.from(map.values()).sort((a, b) => a.handler.localeCompare(b.handler, 'zh-Hant'));
  }, [month, selectedMonthKey, statCases, year]);

  const yearlyHandlerRows = useMemo(() => {
    const map = new Map<string, HandlerTotalRow>();
    statCases
      .filter((caseRow) => yearKey(caseRow.application_date) === year)
      .forEach((caseRow) => {
        const key = `${year}|${caseRow.handler_name}`;
        const row = map.get(key) ?? { year, handler: caseRow.handler_name, count: 0 };
        row.count += 1;
        map.set(key, row);
      });
    return Array.from(map.values()).sort((a, b) => a.handler.localeCompare(b.handler, 'zh-Hant'));
  }, [statCases, year]);

  const itemRows = useMemo(() => data.applicationItems.filter((item) => item.included_in_stats).map<ItemStatRow>((item) => ({
    itemName: item.name,
    monthCount: statCases.filter((caseRow) => caseRow.application_item_id === item.id && monthKey(caseRow.application_date) === selectedMonthKey).length,
    yearCount: statCases.filter((caseRow) => caseRow.application_item_id === item.id && yearKey(caseRow.application_date) === year).length
  })), [data.applicationItems, selectedMonthKey, statCases, year]);

  const yearMonthRows = useMemo<YearMonthRow[]>(() => {
    const months = Array.from({ length: 12 }, (_, index) => statCases.filter((caseRow) => yearKey(caseRow.application_date) === year && monthKey(caseRow.application_date).endsWith(String(index + 1).padStart(2, '0'))).length);
    return [{ year, months, total: months.reduce((sum, count) => sum + count, 0) }];
  }, [statCases, year]);

  const monthlyTotalAmount = useMemo(() => statCases
    .filter((caseRow) => monthKey(caseRow.application_date) === selectedMonthKey)
    .reduce((sum, caseRow) => sum + (Number.isFinite(Number(caseRow.amount)) ? Number(caseRow.amount) : 0), 0), [selectedMonthKey, statCases]);

  const yearlyTotalAmount = useMemo(() => statCases
    .filter((caseRow) => yearKey(caseRow.application_date) === year)
    .reduce((sum, caseRow) => sum + (Number.isFinite(Number(caseRow.amount)) ? Number(caseRow.amount) : 0), 0), [statCases, year]);

  const yearMonthAmountRows = useMemo<YearMonthAmountRow[]>(() => {
    const months = Array.from({ length: 12 }, (_, index) => {
      const targetMonth = `${year}-${String(index + 1).padStart(2, '0')}`;
      return statCases
        .filter((caseRow) => monthKey(caseRow.application_date) === targetMonth)
        .reduce((sum, caseRow) => sum + (Number.isFinite(Number(caseRow.amount)) ? Number(caseRow.amount) : 0), 0);
    });
    return [{ year, months, total: months.reduce((sum, amount) => sum + amount, 0) }];
  }, [statCases, year]);

  const brokerRows = useMemo(() => data.brokers.map<BrokerStatRow>((broker) => ({
    brokerName: broker.name,
    monthCount: statCases.filter((caseRow) => caseRow.broker_id === broker.id && monthKey(caseRow.application_date) === selectedMonthKey).length,
    yearCount: statCases.filter((caseRow) => caseRow.broker_id === broker.id && yearKey(caseRow.application_date) === year).length,
    totalCount: statCases.filter((caseRow) => caseRow.broker_id === broker.id).length
  })), [data.brokers, selectedMonthKey, statCases, year]);

  const handlerColumns = [
    { key: 'year', title: '年份', render: (row: HandlerTotalRow) => row.year },
    { key: 'month', title: '月份', render: (row: HandlerTotalRow) => row.month ?? '全年' },
    { key: 'handler', title: '承辦', render: (row: HandlerTotalRow) => row.handler },
    { key: 'count', title: '申請總件數', render: (row: HandlerTotalRow) => row.count }
  ];

  return (
    <div className="page-content stats-page">
      <PageHeader title="統計數據" description="每月每人總件數、每年每人總件數、各項目、年度各月與仲介申請數據。" />
      <section className="card full-width-card compact-table-card">
        <div className="toolbar-row">
          <h2>年份、月份篩選</h2>
          <label className="inline-field"><span>年份</span><select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label className="inline-field"><span>月份</span><select value={month} onChange={(e) => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((item) => <option key={item} value={item}>{Number(item)}月</option>)}</select></label>
        </div>
      </section>
      <section className="stats-money-summary">
        <div className="card stats-money-card"><span>本月總申請金額</span><strong>{formatMoney(monthlyTotalAmount)} 元</strong><small>{year} 年 {Number(month)} 月</small></div>
        <div className="card stats-money-card"><span>本年總申請金額</span><strong>{formatMoney(yearlyTotalAmount)} 元</strong><small>{year} 年度</small></div>
      </section>
      <section className="card full-width-card compact-table-card">
        <h2>每月每人申請總件數</h2>
        <DataTable columns={handlerColumns} rows={monthlyHandlerRows} rowKey={(row) => `${row.year}-${row.month}-${row.handler}`} emptyText="此月份沒有統計資料" />
      </section>
      <section className="card full-width-card compact-table-card">
        <h2>每年每人申請總件數</h2>
        <DataTable columns={handlerColumns} rows={yearlyHandlerRows} rowKey={(row) => `${row.year}-${row.handler}`} emptyText="此年度沒有統計資料" />
      </section>
      <section className="card full-width-card compact-table-card">
        <h2>各項目申請數據｜每月 / 每年</h2>
        <DataTable columns={[
          { key: 'item', title: '申請項目', render: (row: ItemStatRow) => row.itemName },
          { key: 'month', title: '本月件數', render: (row: ItemStatRow) => row.monthCount },
          { key: 'year', title: '本年件數', render: (row: ItemStatRow) => row.yearCount }
        ]} rows={itemRows} rowKey={(row) => row.itemName} emptyText="沒有項目統計" />
      </section>
      <section className="card full-width-card compact-table-card yearly-month-table">
        <h2>年度每個月的數量數據</h2>
        <DataTable columns={[
          { key: 'year', title: '年度', render: (row: YearMonthRow) => row.year },
          ...Array.from({ length: 12 }, (_, index) => ({ key: `m${index + 1}`, title: `${index + 1}月`, render: (row: YearMonthRow) => row.months[index] })),
          { key: 'total', title: '年度合計', render: (row: YearMonthRow) => row.total }
        ]} rows={yearMonthRows} rowKey={(row) => row.year} emptyText="沒有年度數據" />
      </section>
      <section className="card full-width-card compact-table-card yearly-month-table">
        <h2>年度每個月的申請金額</h2>
        <DataTable columns={[
          { key: 'year', title: '年度', render: (row: YearMonthAmountRow) => row.year },
          ...Array.from({ length: 12 }, (_, index) => ({ key: `amount-m${index + 1}`, title: `${index + 1}月金額`, render: (row: YearMonthAmountRow) => formatMoney(row.months[index]) })),
          { key: 'total', title: '年度總金額', render: (row: YearMonthAmountRow) => formatMoney(row.total) }
        ]} rows={yearMonthAmountRows} rowKey={(row) => `amount-${row.year}`} emptyText="沒有年度金額數據" />
      </section>
      <section className="card full-width-card compact-table-card">
        <h2>各仲介的申請數據</h2>
        <DataTable columns={[
          { key: 'broker', title: '仲介', render: (row: BrokerStatRow) => row.brokerName },
          { key: 'month', title: '月件數', render: (row: BrokerStatRow) => row.monthCount },
          { key: 'year', title: '年件數', render: (row: BrokerStatRow) => row.yearCount },
          { key: 'total', title: '合計件數', render: (row: BrokerStatRow) => row.totalCount }
        ]} rows={brokerRows} rowKey={(row) => row.brokerName} emptyText="沒有仲介統計" />
      </section>
    </div>
  );
}
