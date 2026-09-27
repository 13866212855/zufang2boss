export interface VisitorScoreResult {
  score: number;
  level: 'high' | 'medium_high' | 'normal' | 'low';
  levelLabel: string;
  levelColor: string;
  breakdown: {
    category: string;
    points: number;
    maxPoints: number;
    desc: string;
  }[];
}

export function calculateVisitorIntentScore(visitor: {
  total_visits: number;
  total_duration_sec: number;
  inquired_rent: number;
  phone_number?: string | null;
  recent_visits_7d?: number;
  chat_count?: number;
}): VisitorScoreResult {
  const breakdown: VisitorScoreResult['breakdown'] = [];
  let totalScore = 0;

  // 1. Visit Frequency & Recent Visits (Max 25 pts)
  const visits = visitor.total_visits || 1;
  const recent7d = visitor.recent_visits_7d ?? visits;
  let visitPts = 5;
  let visitDesc = `累计访问${visits}次`;

  if (recent7d >= 5 || visits >= 8) {
    visitPts = 25;
    visitDesc = `近期高频访问(7天内${recent7d}次，总计${visits}次)`;
  } else if (recent7d >= 3 || visits >= 5) {
    visitPts = 20;
    visitDesc = `多次回访关注(7天内${recent7d}次)`;
  } else if (recent7d >= 2 || visits >= 2) {
    visitPts = 14;
    visitDesc = `二次回访(近7天${recent7d}次)`;
  } else {
    visitPts = 6;
    visitDesc = `首次到访浏览`;
  }
  breakdown.push({
    category: '访问频次与近期活跃',
    points: visitPts,
    maxPoints: 25,
    desc: visitDesc
  });
  totalScore += visitPts;

  // 2. Dwell Duration (Max 20 pts)
  const duration = visitor.total_duration_sec || 0;
  let durationPts = 3;
  let durationDesc = `${duration}秒`;

  if (duration >= 300) {
    durationPts = 20;
    durationDesc = `深度停留超5分钟(${Math.floor(duration / 60)}分${duration % 60}秒)`;
  } else if (duration >= 180) {
    durationPts = 16;
    durationDesc = `沉浸浏览超3分钟(${Math.floor(duration / 60)}分${duration % 60}秒)`;
  } else if (duration >= 90) {
    durationPts = 12;
    durationDesc = `仔细阅览超90秒(${duration}秒)`;
  } else if (duration >= 30) {
    durationPts = 7;
    durationDesc = `普通浏览时长(${duration}秒)`;
  } else {
    durationPts = 3;
    durationDesc = `短暂停留(${duration}秒)`;
  }
  breakdown.push({
    category: '单次/累计浏览时长',
    points: durationPts,
    maxPoints: 20,
    desc: durationDesc
  });
  totalScore += durationPts;

  // 3. Clicked "Inquire Rent" (Max 20 pts)
  const inquired = visitor.inquired_rent ? 1 : 0;
  const inquirePts = inquired ? 20 : 0;
  breakdown.push({
    category: '触发询租意向行为',
    points: inquirePts,
    maxPoints: 20,
    desc: inquired ? '已主动点击"询问租金"' : '尚未点击"询问租金"'
  });
  totalScore += inquirePts;

  // 4. Submitted Phone Number (Max 25 pts)
  const hasPhone = visitor.phone_number && visitor.phone_number.trim().length >= 11;
  const phonePts = hasPhone ? 25 : 0;
  breakdown.push({
    category: '留存真实联系方式',
    points: phonePts,
    maxPoints: 25,
    desc: hasPhone ? `已留手机号(${visitor.phone_number?.trim()})` : '未提交联系电话'
  });
  totalScore += phonePts;

  // 5. Active Chat Consultation (Max 10 pts)
  const chatCount = visitor.chat_count || 0;
  let chatPts = 0;
  let chatDesc = '未发起咨询';
  if (chatCount >= 3) {
    chatPts = 10;
    chatDesc = `深入多轮咨询(${chatCount}条交流)`;
  } else if (chatCount >= 1) {
    chatPts = 6;
    chatDesc = `已发起房源在线咨询(${chatCount}条互动)`;
  }
  breakdown.push({
    category: '主动房源在线咨询',
    points: chatPts,
    maxPoints: 10,
    desc: chatDesc
  });
  totalScore += chatPts;

  // Clamped 0 - 100
  const score = Math.min(100, Math.max(0, totalScore));

  let level: VisitorScoreResult['level'] = 'low';
  let levelLabel = '初步浏览 (轻度访客)';
  let levelColor = '#64748B'; // slate-500

  if (score >= 80) {
    level = 'high';
    levelLabel = '极高意向 (重点跟进)';
    levelColor = '#DC2626'; // red-600
  } else if (score >= 60) {
    level = 'medium_high';
    levelLabel = '较高意向 (优先关注)';
    levelColor = '#D97706'; // amber-600
  } else if (score >= 35) {
    level = 'normal';
    levelLabel = '一般意向 (潜在租客)';
    levelColor = '#2563EB'; // blue-600
  }

  return {
    score,
    level,
    levelLabel,
    levelColor,
    breakdown
  };
}
