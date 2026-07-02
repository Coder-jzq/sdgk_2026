const state = { rows: [], rankMap: [], summary: null };
const $ = id => document.getElementById(id);

function n(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function fmt(value) {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return value.toLocaleString("zh-CN");
  return String(value);
}

function text(value) {
  return value === null || value === undefined ? "" : String(value);
}

function rankFromScore(score) {
  if (!score || !state.rankMap.length) return null;
  const sorted = [...state.rankMap].sort((a, b) => b.score - a.score);
  let best = sorted[sorted.length - 1];
  for (const row of sorted) {
    if (score >= Number(row.score)) {
      best = row;
      break;
    }
  }
  return best ? Number(best.rank) : null;
}

function bucket(gap, rank) {
  if (gap === null) return ["无参考", "risk-none", 4];
  const ratio = gap / Math.max(rank, 1);
  if (gap < 0 && Math.abs(ratio) <= 0.12) return ["冲", "risk-reach", 1];
  if (gap < 0) return ["难", "risk-hard", 3];
  if (ratio <= 0.20) return ["稳", "risk-safe", 0];
  return ["保", "risk-backup", 2];
}

function allowedByColorWeak(row, colorWeak) {
  if (colorWeak !== "yes") return true;
  return row.color_weak_allowed !== "no";
}

function filterRows(rank) {
  const keyword = $("keyword").value.trim().toLowerCase();
  const ownership = $("ownership").value;
  const reference = $("reference").value;
  const colorWeak = $("colorWeak").value;
  return state.rows
    .filter(row => allowedByColorWeak(row, colorWeak))
    .filter(row => !ownership || row.school_ownership === ownership)
    .filter(row => !reference || row.match_status === reference)
    .filter(row => {
      if (!keyword) return true;
      return [row.school_name, row.major_name, row.subject_requirement, row.school_location]
        .some(v => text(v).toLowerCase().includes(keyword));
    })
    .map(row => {
      const minRank = n(row.min_rank_2025);
      const gap = rank && minRank ? minRank - rank : null;
      const b = bucket(gap, rank || 1);
      return { ...row, gap, risk: b[0], riskClass: b[1], riskOrder: b[2] };
    });
}

function sortRows(rows, rank) {
  if (!rank) {
    return rows.sort((a, b) => {
      const ar = a.min_rank_2025 || Number.MAX_SAFE_INTEGER;
      const br = b.min_rank_2025 || Number.MAX_SAFE_INTEGER;
      return ar - br || text(a.school_name).localeCompare(text(b.school_name), "zh-CN");
    });
  }
  return rows
    .filter(row => row.risk !== "难")
    .sort((a, b) => a.riskOrder - b.riskOrder || Math.abs(a.gap || 999999999) - Math.abs(b.gap || 999999999));
}

function riskCell(row) {
  if (row.gap === null) {
    return `<strong>无参考</strong><div class="muted">保留2026计划</div>`;
  }
  const sign = row.gap >= 0 ? "+" : "";
  return `<strong>${row.risk}</strong><div class="muted">${sign}${fmt(row.gap)}</div>`;
}

function referenceCell(row) {
  if (!row.min_rank_2025) {
    return `<span class="warn-text">无2025投档参考</span><div class="muted">需人工核对或补充来源</div>`;
  }
  return `${fmt(row.min_score_2025)}分 / ${fmt(row.min_rank_2025)}位<div class="muted">${row.admission_round_2025 || ""}</div>`;
}

function ownershipCell(row) {
  const cls = row.school_ownership === "民办" ? "tag-private" :
    row.school_ownership === "公办" ? "tag-public" :
    row.school_ownership === "中外合作办学" ? "tag-joint" : "tag-review";
  return `<span class="pill ${cls}">${row.school_ownership || "待人工核验"}</span><div class="muted">${row.school_authority || ""}</div>`;
}

function render() {
  const score = n($("score").value);
  const directRank = n($("rank").value);
  const rank = directRank || rankFromScore(score);
  const limit = Math.max(5, Math.min(300, Number($("limit").value || 50)));
  $("rankStat").textContent = rank ? `采用位次 ${fmt(rank)}` : "未输入位次时按2025参考位次排序";

  const filtered = filterRows(rank);
  const matched = filtered.filter(row => row.match_status === "matched").length;
  const unmatched = filtered.length - matched;
  const rows = sortRows(filtered, rank).slice(0, limit);
  $("filterStat").textContent = `当前筛选 ${fmt(filtered.length)} 条：有参考 ${fmt(matched)} / 无参考 ${fmt(unmatched)}`;

  $("results").innerHTML = rows.map(row => `
    <tr>
      <td class="${row.riskClass}">${riskCell(row)}</td>
      <td>${row.school_name}<div class="muted">${row.school_code || ""} ${row.school_location || ""}</div></td>
      <td>${ownershipCell(row)}</td>
      <td>${row.major_name}<div class="muted">${row.major_code || ""} ${row.subject_requirement || ""}</div></td>
      <td>${fmt(row.plan_count_2026)}<div class="muted">2026</div></td>
      <td>${fmt(row.tuition_2026)}</td>
      <td>${referenceCell(row)}</td>
      <td>${row.color_weak_allowed === "no" ? "不可" : row.color_weak_allowed === "unknown" ? "核对" : "可"}<div class="muted">${row.color_weak_reason || ""}</div></td>
      <td>${fmt(row.source_page)}</td>
    </tr>`).join("") || '<tr><td colspan="9" class="muted">当前条件没有匹配结果。</td></tr>';
}

async function init() {
  const [rows, rankMap, summary] = await Promise.all([
    fetch("./data/plans_2026.json").then(r => r.json()),
    fetch("./data/score_rank_2025.json").then(r => r.json()).catch(() => []),
    fetch("./data/summary.json").then(r => r.json()).catch(() => null),
  ]);
  state.rows = rows;
  state.rankMap = rankMap;
  state.summary = summary;
  const total = summary ? summary.total_plan_rows_2026 : rows.length;
  const matched = summary ? summary.matched_rows : rows.filter(r => r.match_status === "matched").length;
  $("dataStat").textContent = `2026计划 ${fmt(total)} 条 / 2025参考 ${fmt(matched)} 条 / 分数映射 ${fmt(rankMap.length)} 档`;
  ["score", "rank", "keyword", "ownership", "reference", "limit", "colorWeak"].forEach(id => {
    $(id).addEventListener("input", render);
    $(id).addEventListener("change", render);
  });
  $("run").addEventListener("click", render);
  render();
}

init();
