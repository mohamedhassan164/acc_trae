import Layout from "@/components/Layout";
import UserManagement from "@/components/users/UserManagement";
import { useAuth } from "@/providers/AuthProvider";

export default function Dashboard() {
  const { user } = useAuth();
  const isManager = user?.role === "manager";

  return (
    <Layout>
      <div className="space-y-8">
        <section className="grid md:grid-cols-3 gap-4">
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
            <div className="mt-2 text-2xl font-bold">{isManager ? "إدارة المستخدمين مسموحة" : "إدارة المستخدمين غير متاحة"}</div>
          </div>
        </section>

        {isManager ? (
          <UserManagement />
        ) : (
          <div className="rounded-xl p-6 bg-white border border-slate-200 shadow">
            <h2 className="text-xl font-bold mb-2">مرحبا بك</h2>
            <p className="text-slate-600">يمكنك استعراض النظام. لإضافة أو تعديل المستخدمين، اطلب من المدير.</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
