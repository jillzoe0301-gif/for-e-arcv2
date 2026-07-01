import { useMemo, useState } from 'react';
import { DataTable } from '../components/DataTable';
import { PageHeader } from '../components/PageHeader';
import type { ArcData } from '../types';
import { monthKey, todayTaipei, yearKey } from '../utils/date';

interface HandlerMonthRow {
  handler: string;
  month: string;
  itemName: string;
  count: number;
}

interface ItemStatRow {
  itemName: string;
  monthCount: number;
  yearCount: number;
}

export function StatsPage({ data }: { data: ArcData }) {
  const currentMonth = todayTaipei().slice(0, 7);
  const currentYear = todayTaipei().slice(0, 4);
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);

  const statCases = data.cases.filter((caseRow) => {
    const item = data.applicationItems.find((entry) => entry.id === caseRow.application_item_id);
    return item?.included_in_stats && caseRow.status !== 'cancelled';
  });

  const handlerRows = useMemo(() => {
    const map = new Map<string, HandlerMonthRow>();
    statCases.forEach((caseRow) => {
      const m = monthKey(caseRow.application_date);
      const itemName = data.applicationItems.find((item) => item.id === caseRow.application_item_id)?.name ?? '未設定';
      const key = `${caseRow.handler_name}|${m}|${itemName}`;
      const row = map.get(key) ?? { handler: caseRow.handler_name, month: m, itemName, count: 0 };
      row.count += 1;
      map.set(key, row);
    });
    return Array.from(map.values()).filter((row) => !month || row.month === month).sort((a, b) => a.handler.localeCompare(b.handler, 'zh-Hant') || a.itemName.localeCompare(b.itemName, 'zh-Hant'));
  }, [data.applicationItems, month, statCases]);

  const itemRows = useMemo(() => {
    return data.applicationItems.filter((item) => item.included_in_stats).map<ItemStatRow>((item) => ({
      itemName: item.name,
      monthCount: statCases.filter((caseRow) => caseRow.application_item_id === item.id && monthKey(caseRow.application_date) === month).length,
      yearCount: statCases.filter((caseRow) => caseRow.application_item_id === item.id && yearKey(caseRow.application_date) === year).length
    }));
  }, [data.applicationItems, month, statCases, year]);

  const years = Array.from(new Set(statCases.map((item) => yearKey(item.application_date)).filter(Boolean))).sort().reverse();
  const months = Array.from(new Set(statCases.map((item) => monthKey(item.application_date)).filter(Boolean))).sort().reverse();

  const cumulativeRows = years.map((yearItem) => ({ year: yearItem, count: statCases.filter((caseRow) => yearKey(caseRow.application_date) === yearItem).length }));

  return (
    <div className="page-content stats-page">
      <PageHeader title="統計數據" description="每月每個人申請件數、各項目本月 / 本年數據、年度累計紀錄。" />
      <section className="card full-width-card compact-table-card">
        <div className="toolbar-row">
          <h2>每月每個人申請件數</h2>
          <label className="inline-field"><span>年月</span><select value={month} onChange={(e) => setMonth(e.target.value)}>{months.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        </div>
        <DataTable columns={[
          { key: 'handler', title: '承辦 / 行政人員', render: (row: HandlerMonthRow) => row.handler },
          { key: 'month', title: '年月', render: (row: HandlerMonthRow) => row.month },
          { key: 'item', title: '申請項目', render: (row: HandlerMonthRow) => row.itemName },
          { key: 'count', title: '件數', render: (row: HandlerMonthRow) => row.count }
        ]} rows={handlerRows} rowKey={(row) => `${row.handler}-${row.month}-${row.itemName}`} emptyText="此月份沒有統計資料" />
      </section>
      <section className="card full-width-card compact-table-card">
        <div className="toolbar-row"><h2>各項目申請數據｜本月 / 本年</h2><label className="inline-field"><span>年度</span><select value={year} onChange={(e) => setYear(e.target.value)}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label></div>
        <DataTable columns={[
          { key: 'item', title: '申請項目', render: (row: ItemStatRow) => row.itemName },
          { key: 'month', title: '本月件數', render: (row: ItemStatRow) => row.monthCount },
          { key: 'year', title: '本年件數', render: (row: ItemStatRow) => row.yearCount }
        ]} rows={itemRows} rowKey={(row) => row.itemName} emptyText="沒有項目統計" />
      </section>
      <section className="card full-width-card compact-table-card">
        <h2>年度累計紀錄</h2>
        <DataTable columns={[
          { key: 'year', title: '年度', render: (row: { year: string }) => row.year },
          { key: 'count', title: '累計件數', render: (row: { count: number }) => row.count }
        ]} rows={cumulativeRows} rowKey={(row) => row.year} emptyText="沒有年度累計資料" />
      </section>
    </div>
  );
}
