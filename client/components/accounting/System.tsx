import { useMemo, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import UserManagement from "@/components/users/UserManagement";
import { toast } from "sonner";

type TransType = "revenue" | "expense";
interface Transaction { id: string; date: string; type: TransType; description: string; amount: number; }
interface InventoryItem { id: string; name: string; updatedAt: string; quantity: number; unit: string; min: number; }
interface Movement { id: string; itemId: string; kind: "in"|"out"; qty: number; unitPrice: number; total: number; party: string; date: string; }
interface Project { id: string; name: string; location: string; floors: number; units: number; createdAt: string; }
interface ProjectCost { id: string; projectId: string; type: "construction"|"operation"|"expense"; amount: number; date: string; note: string; }
interface ProjectSale { id: string; projectId: string; unitNo: string; buyer: string; price: number; date: string; terms?: string; }

function uid() { return Math.random().toString(36).slice(2); }

export default function AccountingSystem() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";
  const [active, setActive] = useState<"dashboard"|"transactions"|"inventory"|"reports"|"users">("dashboard");

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([
    { id: uid(), date: "2024-12-01", type: "revenue", description: "بيع شقة - المشروع الأول", amount: 150000 },
    { id: uid(), date: "2024-11-28", type: "expense", description: "شراء مواد بناء - أسمنت", amount: 25000 },
  ]);
  const [quick, setQuick] = useState<{ type: TransType; amount: string; description: string; date: string }>(() => ({ type: "revenue", amount: "", description: "", date: new Date().toLocaleDateString("en-CA") }));

  const totals = useMemo(() => {
    const rev = transactions.filter(t=>t.type==="revenue").reduce((a,b)=>a+b.amount,0);
    const exp = transactions.filter(t=>t.type==="expense").reduce((a,b)=>a+b.amount,0);
    return { revenue: rev, expenses: exp, profit: rev-exp };
  }, [transactions]);

  const addQuick = () => {
    if (!quick.amount || !quick.description || !quick.date) return;
    setTransactions(prev => [{ id: uid(), date: quick.date, type: quick.type, description: quick.description, amount: Number(quick.amount) }, ...prev]);
    setQuick({ type: "revenue", amount: "", description: "", date: new Date().toLocaleDateString("en-CA") });
  };

  const deleteTrans = (id: string) => setTransactions(prev => prev.filter(t=>t.id!==id));

  // Inventory state
  const [items, setItems] = useState<InventoryItem[]>([
    { id: uid(), name: "أسمنت مقاوم", updatedAt: "2024-12-01", quantity: 450, unit: "طن", min: 100 },
    { id: uid(), name: "حديد تسليح", updatedAt: "2024-11-30", quantity: 50, unit: "طن", min: 80 },
    { id: uid(), name: "طوب أحمر", updatedAt: "2024-12-01", quantity: 15000, unit: "قطعة", min: 5000 },
  ]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [newItem, setNewItem] = useState({ name: "", quantity: "", unit: "طن", min: "" });
  const addItem = () => {
    if (!newItem.name || !newItem.quantity || !newItem.min) return;
    setItems(prev => [...prev, { id: uid(), name: newItem.name, updatedAt: new Date().toLocaleDateString("en-CA"), quantity: Number(newItem.quantity), unit: newItem.unit, min: Number(newItem.min) }]);
    setNewItem({ name: "", quantity: "", unit: "طن", min: "" });
  };
  const deleteItem = (id: string) => setItems(prev => prev.filter(i=>i.id!==id));

  // Receive/Issue forms
  const today = () => new Date().toLocaleDateString("en-CA");
  const [receive, setReceive] = useState({ itemId: "", qty: "", unitPrice: "", supplier: "", date: today() });
  const [issue, setIssue] = useState({ itemId: "", qty: "", unitPrice: "", project: "", date: today() });

  const receiveSubmit = () => {
    if (!receive.itemId || !receive.qty || !receive.unitPrice || !receive.supplier) return;
    const qty = Number(receive.qty); const price = Number(receive.unitPrice); const total = qty * price;
    setItems(prev => prev.map(i => i.id===receive.itemId ? { ...i, quantity: i.quantity + qty, updatedAt: receive.date } : i));
    setMovements(prev => [{ id: uid(), itemId: receive.itemId, kind: "in", qty, unitPrice: price, total, party: receive.supplier, date: receive.date }, ...prev]);
    setTransactions(prev => [{ id: uid(), date: receive.date, type: "expense", description: `شراء ${getItemName(receive.itemId)} من ${receive.supplier} (${qty} ${getItemUnit(receive.itemId)} × ${price.toLocaleString()})`, amount: total }, ...prev]);
    const it = items.find(i=>i.id===receive.itemId);
    if (it && it.quantity + qty < it.min) toast.warning(`تنبيه: مخزون ${it.name} منخفض`);
    toast.success("تم تسجيل الوارد وتحديث المصروفات");
    setReceive({ itemId: "", qty: "", unitPrice: "", supplier: "", date: today() });
  };

  const issueSubmit = () => {
    if (!issue.itemId || !issue.qty || !issue.unitPrice || !issue.project) return;
    const qty = Number(issue.qty); const price = Number(issue.unitPrice); const total = qty * price;
    setItems(prev => prev.map(i => i.id===issue.itemId ? { ...i, quantity: Math.max(0, i.quantity - qty), updatedAt: issue.date } : i));
    setMovements(prev => [{ id: uid(), itemId: issue.itemId, kind: "out", qty, unitPrice: price, total, party: issue.project, date: issue.date }, ...prev]);
    setTransactions(prev => [{ id: uid(), date: issue.date, type: "expense", description: `صرف ${getItemName(issue.itemId)} لمشروع ${issue.project} (${qty} ${getItemUnit(issue.itemId)} × ${price.toLocaleString()})`, amount: total }, ...prev]);
    const it = items.find(i=>i.id===issue.itemId);
    if (it && it.quantity - qty < it.min) toast.warning(`تنبيه: مخزون ${it.name} منخفض`);
    toast.success("تم تسجيل الصرف وتحديث المصروفات");
    setIssue({ itemId: "", qty: "", unitPrice: "", project: "", date: today() });
  };

  function getItemName(id: string){ return items.find(i=>i.id===id)?.name ?? ""; }
  function getItemUnit(id: string){ return items.find(i=>i.id===id)?.unit ?? ""; }

  // Reports
  const [reportType, setReportType] = useState("profit-loss");
  const [dateFrom, setDateFrom] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA"));
  const [dateTo, setDateTo] = useState(() => new Date().toLocaleDateString("en-CA"));

  const filtered = useMemo(() => transactions.filter(t => t.date >= dateFrom && t.date <= dateTo), [transactions, dateFrom, dateTo]);

  const exportCsv = () => {
    const rows = [["date","type","description","amount"], ...filtered.map(t=>[t.date,t.type,t.description,String(t.amount)])];
    const csv = rows.map(r=>r.map(x=>`"${x.replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="report.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">لوحة التحكم</h1>
          <p className="text-slate-500 text-sm">نظام محاسبة عقاري سهل الاستخدام</p>
        </div>
        <div className="flex gap-2">
          {(["dashboard","transactions","inventory","reports","users"] as const).map(tab => (
            <button key={tab} onClick={()=>setActive(tab)} className={`px-3 py-2 rounded-full border ${active===tab?"bg-gradient-to-r from-indigo-600 to-violet-600 text-white border-transparent":"border-indigo-300 text-indigo-700"}`}>
              {tab==="dashboard"?"لوحة التحكم":tab==="transactions"?"المعاملات":tab==="inventory"?"المخزون":tab==="reports"?"التقارير":"المستخدمون"}
            </button>
          ))}
        </div>
      </div>

      {active==="dashboard" && (
        <section className="space-y-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="rounded-xl p-4 bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow">
              <div className="text-sm opacity-90">الحساب</div>
              <div className="mt-2 text-2xl font-extrabold">{user?.name}</div>
              <div className="text-xs mt-1">الدور: {user?.role === "manager" ? "مدير" : user?.role === "accountant" ? "محاسب" : "موظف"}</div>
            </div>
            <div className="rounded-xl p-4 bg-white border border-slate-200 shadow">
              <div className="text-sm text-slate-600">الوضع</div>
              <div className="mt-2 text-2xl font-bold">{isManager ? "صلاحيات مدير" : "مستخدم عادي"}</div>
            </div>
            <div className="rounded-xl p-4 bg-white border border-slate-200 shadow">
              <div className="text-sm text-slate-600">الوصول</div>
              <div className="mt-2 text-2xl font-bold">{isManager ? "إدارة المستخدمين مسموحة" : "غير متاحة"}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <Stat value={totals.revenue} label="إجمالي الإيرادات" color="text-emerald-600" />
            <Stat value={totals.expenses} label="إجمالي المصروفات" color="text-rose-600" />
            <Stat value={totals.profit} label="صافي الربح" color="text-indigo-700" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">إضافة معاملة سريعة</h3>
            <div className="grid md:grid-cols-5 gap-3">
              <select className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={quick.type} onChange={(e)=>setQuick({ ...quick, type: e.target.value as TransType })}>
                <option value="revenue">إيراد</option>
                <option value="expense">مصروف</option>
              </select>
              <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="المبلغ" value={quick.amount} onChange={(e)=>setQuick({ ...quick, amount: e.target.value })} />
              <input type="date" className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={quick.date} onChange={(e)=>setQuick({ ...quick, date: e.target.value })} />
              <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2 md:col-span-2" placeholder="الوصف" value={quick.description} onChange={(e)=>setQuick({ ...quick, description: e.target.value })} />
            </div>
            <button onClick={addQuick} className="mt-3 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2">إضافة معاملة</button>
          </div>
        </section>
      )}

      {active==="transactions" && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow">
          <h3 className="font-semibold mb-3">المعاملات المالية</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2">التاريخ</th>
                  <th className="px-3 py-2">النوع</th>
                  <th className="px-3 py-2">الوصف</th>
                  <th className="px-3 py-2">المبلغ</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(t => (
                  <tr key={t.id} className="border-t">
                    <td className="px-3 py-2">{t.date}</td>
                    <td className="px-3 py-2"><span className={`px-2 py-1 rounded-full text-xs ${t.type==="revenue"?"bg-emerald-100 text-emerald-700":"bg-rose-100 text-rose-700"}`}>{t.type==="revenue"?"إيراد":"مصروف"}</span></td>
                    <td className="px-3 py-2">{t.description}</td>
                    <td className="px-3 py-2">{t.amount.toLocaleString()} ريال</td>
                    <td className="px-3 py-2 text-right">
                      <button className="rounded-md bg-red-600 text-white px-3 py-1" onClick={()=>deleteTrans(t.id)}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {active==="inventory" && (
        <section className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
            <h3 className="font-semibold mb-3">إضافة مادة جديدة</h3>
            <div className="grid md:grid-cols-4 gap-3">
              <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="اسم المادة" value={newItem.name} onChange={(e)=>setNewItem({ ...newItem, name: e.target.value })} />
              <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="الكمية" value={newItem.quantity} onChange={(e)=>setNewItem({ ...newItem, quantity: e.target.value })} />
              <select className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={newItem.unit} onChange={(e)=>setNewItem({ ...newItem, unit: e.target.value })}>
                <option value="طن">طن</option>
                <option value="قطعة">قطعة</option>
                <option value="متر">متر</option>
                <option value="لتر">لتر</option>
              </select>
              <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="الحد الأدنى" value={newItem.min} onChange={(e)=>setNewItem({ ...newItem, min: e.target.value })} />
            </div>
            <button onClick={addItem} className="mt-3 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2">حفظ المادة</button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">تسجيل وارد من مورد</h3>
              <div className="grid md:grid-cols-5 gap-3">
                <select className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={receive.itemId} onChange={(e)=>setReceive({ ...receive, itemId: e.target.value })}>
                  <option value="">اختر المادة</option>
                  {items.map(i=> <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="الكمية" value={receive.qty} onChange={(e)=>setReceive({ ...receive, qty: e.target.value })} />
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="سعر الوحدة" value={receive.unitPrice} onChange={(e)=>setReceive({ ...receive, unitPrice: e.target.value })} />
                <input type="date" className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={receive.date} onChange={(e)=>setReceive({ ...receive, date: e.target.value })} />
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="اسم المورد" value={receive.supplier} onChange={(e)=>setReceive({ ...receive, supplier: e.target.value })} />
              </div>
              <button onClick={receiveSubmit} className="mt-3 rounded-md bg-slate-900 text-white px-4 py-2">تسجيل الوارد</button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">تسجيل صرف لمشروع</h3>
              <div className="grid md:grid-cols-5 gap-3">
                <select className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={issue.itemId} onChange={(e)=>setIssue({ ...issue, itemId: e.target.value })}>
                  <option value="">اختر المادة</option>
                  {items.map(i=> <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="الكمية" value={issue.qty} onChange={(e)=>setIssue({ ...issue, qty: e.target.value })} />
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="سعر الوحدة" value={issue.unitPrice} onChange={(e)=>setIssue({ ...issue, unitPrice: e.target.value })} />
                <input type="date" className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={issue.date} onChange={(e)=>setIssue({ ...issue, date: e.target.value })} />
                <input className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" placeholder="اسم المشروع" value={issue.project} onChange={(e)=>setIssue({ ...issue, project: e.target.value })} />
              </div>
              <button onClick={issueSubmit} className="mt-3 rounded-md bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-4 py-2">تسجيل الصرف</button>
            </div>
          </div>

          <div className="space-y-2">
            {items.map(i => (
              <div key={i.id} className={`flex items-center justify-between bg-white border rounded-lg p-3 ${i.quantity < i.min ? "border-rose-300" : "border-slate-200"}`}>
                <div>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">آخر تحديث: {i.updatedAt}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${i.quantity < i.min ? "text-rose-600" : ""}`}>{i.quantity.toLocaleString()} {i.unit}</div>
                  <div className={`text-xs ${i.quantity < i.min ? "text-rose-600" : "text-emerald-600"}`}>{i.quantity < i.min ? "مخزون منخفض" : "متوفر"}</div>
                </div>
                <button className="rounded-md bg-red-600 text-white px-3 py-1" onClick={()=>deleteItem(i.id)}>حذف</button>
              </div>
            ))}
          </div>

          {movements.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow">
              <h3 className="font-semibold mb-3">حركة المخزون</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left bg-slate-50">
                      <th className="px-3 py-2">التاريخ</th>
                      <th className="px-3 py-2">المادة</th>
                      <th className="px-3 py-2">نوع الحركة</th>
                      <th className="px-3 py-2">الكمية</th>
                      <th className="px-3 py-2">سعر الوحدة</th>
                      <th className="px-3 py-2">الإجمالي</th>
                      <th className="px-3 py-2">الجهة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map(m => (
                      <tr key={m.id} className="border-t">
                        <td className="px-3 py-2">{m.date}</td>
                        <td className="px-3 py-2">{getItemName(m.itemId)}</td>
                        <td className="px-3 py-2">{m.kind === "in" ? "وارد" : "صرف"}</td>
                        <td className="px-3 py-2">{m.qty} {getItemUnit(m.itemId)}</td>
                        <td className="px-3 py-2">{m.unitPrice.toLocaleString()}</td>
                        <td className="px-3 py-2">{m.total.toLocaleString()}</td>
                        <td className="px-3 py-2">{m.party}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {active==="reports" && (
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow space-y-4">
          <h3 className="font-semibold">التقارير</h3>
          <div className="grid md:grid-cols-4 gap-3">
            <select className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={reportType} onChange={(e)=>setReportType(e.target.value)}>
              <option value="profit-loss">الأرباح والخسائر</option>
              <option value="revenue">الإيرادات</option>
              <option value="expense">المصروفات</option>
            </select>
            <input type="date" className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={dateFrom} onChange={(e)=>setDateFrom(e.target.value)} />
            <input type="date" className="rounded-md border-2 border-slate-200 focus:border-indigo-500 outline-none px-3 py-2" value={dateTo} onChange={(e)=>setDateTo(e.target.value)} />
            <button onClick={exportCsv} className="rounded-md bg-slate-900 text-white px-4 py-2">تصدير CSV</button>
          </div>
          <div className="border rounded-lg p-3">
            <div className="font-semibold mb-2">نتيجة التقرير ({reportType})</div>
            <div className="text-sm text-slate-600">الفترة {dateFrom} - {dateTo}</div>
            <div className="mt-3 grid md:grid-cols-3 gap-3">
              <Stat value={totals.revenue} label="إجمالي الإيرادات" color="text-emerald-600" />
              <Stat value={totals.expenses} label="إجمالي المصروفات" color="text-rose-600" />
              <Stat value={totals.profit} label="صافي الربح" color="text-indigo-700" />
            </div>
          </div>
        </section>
      )}

      {active==="users" && (
        <section>
          {isManager ? (
            <UserManagement />
          ) : (
            <div className="rounded-xl p-6 bg-white border border-slate-200 shadow">ليس لديك صلاحية لعرض إدارة المستخدمين</div>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="rounded-xl p-4 bg-white border border-slate-200 shadow text-center">
      <div className={`text-3xl font-extrabold ${color}`}>{value.toLocaleString()}</div>
      <div className="text-sm text-slate-600 mt-1">{label}</div>
    </div>
  );
}
