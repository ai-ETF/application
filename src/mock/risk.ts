/**
 * ============================================
 * 风险测评 mock 数据：/api/risk/*
 * ============================================
 */

import type { MockRoute } from './index';

const questionnaire = {
  id: 'risk-q-001',
  version: '1.0',
  questions: [
    {
      id: 'q1', question: '您计划投资 ETF 的时间期限是？', category: '投资期限',
      options: [
        { text: '1 年以内', value: 'a' },
        { text: '1-3 年', value: 'b' },
        { text: '3-5 年', value: 'c' },
        { text: '5 年以上', value: 'd' },
      ],
    },
    {
      id: 'q2', question: '您能承受的最大亏损比例是？', category: '风险承受',
      options: [
        { text: '不能承受任何亏损', value: 'a' },
        { text: '10% 以内', value: 'b' },
        { text: '10%-30%', value: 'c' },
        { text: '30% 以上', value: 'd' },
      ],
    },
    {
      id: 'q3', question: '您的投资经验是？', category: '投资经验',
      options: [
        { text: '几乎没有', value: 'a' },
        { text: '1-3 年', value: 'b' },
        { text: '3 年以上', value: 'c' },
      ],
    },
  ],
  total_questions: 3,
};

const profile = {
  risk_level: 'moderate',
  risk_label: '稳健型',
  total_score: 62,
  dimension_scores: { duration: 60, tolerance: 55, experience: 70 },
  summary: '您的风险承受能力为稳健型，适合配置中等波动的 ETF 产品。',
  created_at: '2026-10-30 12:00:00',
};

export const riskRoutes: MockRoute[] = [
  { method: 'GET', pattern: /^\/api\/risk\/questionnaire$/, handler: () => questionnaire },
  {
    method: 'POST',
    pattern: /^\/api\/risk\/submit$/,
    handler: () => ({ success: true, message: '测评提交成功（mock）', profile }),
  },
  { method: 'GET', pattern: /^\/api\/risk\/profile$/, handler: () => ({ has_profile: true, profile }) },
];
