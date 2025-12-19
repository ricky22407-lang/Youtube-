
export interface ShortsData {
  id: string;
  title: string;
  hashtags: string[];
  view_count: number;
  region: string;
  view_growth_rate: number;
  publishedAt?: string;
}

export interface TrendSignals {
  action_verb_frequency: Record<string, number>;
  subject_type_frequency: Record<string, number>;
  object_type_frequency: Record<string, number>;
  structure_type_frequency: Record<string, number>;
  algorithm_signal_frequency: Record<string, number>;
}

export interface CandidateTheme {
  id: string;
  subject_type: string;
  action_verb: string;
  object_type: string;
  structure_type: string;
  algorithm_signals: string[];
  rationale?: string;
  total_score?: number;
  selected?: boolean;
  scoring_breakdown?: {
    virality: number;
    feasibility: number;
    trend_alignment: number;
  };
}

export interface ChannelState {
  niche: string;
  avg_views: number;
  target_audience: string;
}

export interface PromptOutput {
  candidate_id: string;
  prompt: string;
  title_template: string;
  description_template: string;
  candidate_reference: CandidateTheme;
}

export interface VideoAsset {
  candidate_id: string;
  video_url: string;
  mime_type: string;
  status: 'generated' | 'failed';
  generated_at: string;
}

export interface ScheduleConfig {
  active: boolean;
  cron_expression?: string;
  privacy_status: 'private' | 'public' | 'unlisted';
  publish_at?: string;
}

export interface AuthCredentials {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

// Fix: Added missing UploaderInput and UploadResult interfaces used by UploaderScheduler module
export interface UploaderInput {
  video_asset: VideoAsset;
  metadata: PromptOutput;
  schedule: ScheduleConfig;
  authCredentials?: AuthCredentials;
}

export interface UploadResult {
  platform: string;
  video_id: string;
  platform_url: string;
  status: 'uploaded' | 'scheduled';
  scheduled_for?: string;
  uploaded_at: string;
}

export interface ChannelConfig {
  id: string;
  name: string;
  regionCode: string;
  searchKeywords: string[];
  channelState: ChannelState;
  schedule: ScheduleConfig;
  auth: AuthCredentials | null;
  lastRun?: string;
  status: 'idle' | 'running' | 'error' | 'success';
  currentStep?: number;
  stepLabel?: string;
  results?: {
    trends?: ShortsData[];
    winner?: CandidateTheme;
    metadata?: PromptOutput;
  };
}

export interface LogEntry {
  id: string;
  timestamp: string;
  channelId: string;
  channelName: string;
  level: 'info' | 'success' | 'error';
  message: string;
  phase?: string;
}

export interface PipelineResult {
  success: boolean;
  logs: string[];
  videoUrl?: string;
  uploadId?: string;
  error?: string;
  // New fields for intermediate reporting
  trends?: ShortsData[];
  winner?: CandidateTheme;
  metadata?: PromptOutput;
}

export interface IModule<TInput, TOutput> {
  name: string;
  description: string;
  execute(input: TInput): Promise<TOutput>;
}

export interface TestResult {
  moduleName: string;
  passed: boolean;
  logs: string[];
}
