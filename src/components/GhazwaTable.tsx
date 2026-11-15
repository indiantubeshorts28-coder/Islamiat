import { GHAZWA_COMPARISON_TABLE } from "../data/chapters";

export function GhazwaTable() {
  return (
    <section
      id="ghazwa-table"
      className="mt-12 pt-10 border-t border-[#E2DCD0]"
      aria-labelledby="ghazwa-table-heading"
    >
      <div className="mb-6">
        <p className="text-xs text-[#78350F] font-medium mb-1">
          تقابلی جائزہ · یاد دہانی کے لیے خلاصہ
        </p>
        <h3
          id="ghazwa-table-heading"
          className="font-urdu-display text-2xl font-bold text-[#1C1917]"
        >
          مشہور غزوات کا تقابلی جدول
        </h3>
      </div>

      <div className="overflow-x-auto border border-[#E2DCD0] rounded-xl bg-white">
        <table className="w-full text-right border-collapse">
          <thead>
            <tr className="bg-[#F3EFE6] border-b border-[#E2DCD0] text-sm font-semibold text-[#1C1917]">
              <th className="py-3.5 px-4 whitespace-nowrap">غزوہ</th>
              <th className="py-3.5 px-4 whitespace-nowrap">سال</th>
              <th className="py-3.5 px-4 whitespace-nowrap">مسلمان لشکر</th>
              <th className="py-3.5 px-4 whitespace-nowrap">دشمن لشکر و سردار</th>
              <th className="py-3.5 px-4 whitespace-nowrap">نتیجہ</th>
              <th className="py-3.5 px-4 whitespace-nowrap">شہداء</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2DCD0] text-[15px] text-[#292524]">
            {GHAZWA_COMPARISON_TABLE.map((row) => (
              <tr
                key={row.ghazwa}
                className="hover:bg-[#FBF9F5] transition-colors duration-150"
              >
                <td className="py-3.5 px-4 font-semibold text-[#14532D] whitespace-nowrap">
                  {row.ghazwa}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap font-mono-nums">
                  {row.year}
                </td>
                <td className="py-3.5 px-4 whitespace-nowrap font-mono-nums">
                  {row.muslims}
                </td>
                <td className="py-3.5 px-4 min-w-[180px]">{row.enemy}</td>
                <td className="py-3.5 px-4 min-w-[160px]">{row.outcome}</td>
                <td className="py-3.5 px-4 whitespace-nowrap font-mono-nums">
                  {row.martyrs}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
