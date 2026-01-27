export interface MetaAccount {
  id: string;
  user_id: string;
  ad_account_id: string;
  name: string;
  access_token: string;
  token_expires_at: string | null;
  status: 'active' | 'paused' | 'revoked';
  conversion_event: string;
  created_at: string;
  updated_at: string;
}

export interface MetaCampaign {
  id: string;
  ad_account_id: string;
  campaign_id: string;
  name: string;
  objective: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MetaAdset {
  id: string;
  ad_account_id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  optimization_goal: string | null;
  billing_event: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface MetaAd {
  id: string;
  ad_account_id: string;
  ad_id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status: string;
  creative_id: string | null;
  preview_url: string | null;
  thumbnail_url: string | null;
  format: 'image' | 'video' | 'carousel' | 'unknown';
  primary_text: string | null;
  headline: string | null;
  cta: string | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAdInsightsDaily {
  id: string;
  ad_account_id: string;
  ad_id: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  cpm: number | null;
  cpc: number | null;
  ctr: number | null;
  created_at: string;
  updated_at: string;
}

export interface MetaAlert {
  id: string;
  ad_account_id: string;
  ad_id: string | null;
  type: 'no_conversions' | 'ctr_fatigue' | 'high_cpa' | 'custom';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  resolved_at: string | null;
  created_at: string;
}

export interface MetaSyncLog {
  id: string;
  ad_account_id: string;
  sync_type: 'structure' | 'insights' | 'full';
  status: 'running' | 'completed' | 'failed';
  started_at: string;
  completed_at: string | null;
  records_synced: number;
  error_message: string | null;
  created_at: string;
}

// Aggregated types for the dashboard
export interface AdWithMetrics {
  id: string;
  ad_id: string;
  name: string;
  status: string;
  campaign_id: string;
  adset_id: string;
  thumbnail_url: string | null;
  format: string;
  creative_id: string | null;
  preview_url: string | null;
  primary_text: string | null;
  headline: string | null;
  cta: string | null;
  campaign_name: string;
  adset_name: string;
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_conversion_value: number;
  calc_ctr: number;
  calc_cpa: number | null;
  calc_cpc: number | null;
  calc_cvr: number;
}

export interface MetricsSummary {
  total_spend: number;
  total_impressions: number;
  total_clicks: number;
  total_conversions: number;
  total_conversion_value: number;
  ctr: number;
  cpa: number | null;
  cpc: number | null;
  cpm: number | null;
  cvr: number;
}

export interface DailySeries {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpa: number | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export type DatePreset = 'today' | '7d' | '30d' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
}
