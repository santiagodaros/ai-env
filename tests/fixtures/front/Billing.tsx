export function Billing({ invoices }: { invoices: Invoice[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {invoices.map((i) => (
        <div className="rounded-xl shadow p-4" onClick={() => open(i.id)}>
          <h3>{i.client}</h3>
          <span style={{ color: "#9ca3af" }}>{i.total}</span>
        </div>
      ))}
    </div>
  );
}
