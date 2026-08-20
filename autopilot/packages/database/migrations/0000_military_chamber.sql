CREATE TYPE "public"."accuracy_class" AS ENUM('CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."action_category" AS ENUM('TECHNICAL', 'CONTENT', 'ENTITY', 'SCHEMA', 'PROFILE');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLYING', 'APPLIED', 'FAILED', 'ROLLED_BACK', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."agent_run_status" AS ENUM('RUNNING', 'COMPLETED', 'STOPPED_LIMIT', 'STOPPED_BUDGET', 'FAILED', 'CANCELED');--> statement-breakpoint
CREATE TYPE "public"."autonomy_mode" AS ENUM('MONITOR', 'RECOMMEND', 'AUTO_SAFE', 'AUTOPILOT');--> statement-breakpoint
CREATE TYPE "public"."confidence_level" AS ENUM('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."controllability" AS ENUM('CONTROLLED', 'INFLUENCEABLE', 'NOT_CONTROLLED');--> statement-breakpoint
CREATE TYPE "public"."country_code" AS ENUM('IL', 'US', 'GB', 'DE');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('ILS', 'USD', 'EUR', 'GBP');--> statement-breakpoint
CREATE TYPE "public"."data_class" AS ENUM('PUBLIC_BUSINESS_DATA', 'CUSTOMER_ACCOUNT_DATA', 'AUTHENTICATION_DATA', 'OAUTH_TOKEN', 'AI_OUTPUT', 'ANALYTICS', 'BILLING_DATA', 'LOG_DATA');--> statement-breakpoint
CREATE TYPE "public"."experiment_status" AS ENUM('DRAFT', 'RUNNING', 'OBSERVING', 'CONCLUDED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('ACTIVE', 'SUPERSEDED', 'DISPUTED', 'RETRACTED');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED', 'BUDGET_EXCEEDED');--> statement-breakpoint
CREATE TYPE "public"."language_code" AS ENUM('he', 'en', 'ar', 'ru');--> statement-breakpoint
CREATE TYPE "public"."opportunity_status" AS ENUM('OPEN', 'PLANNED', 'IN_PROGRESS', 'DONE', 'DISMISSED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."provider_id" AS ENUM('openai', 'gemini', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."recommendation_class" AS ENUM('NOT_PRESENT', 'MENTIONED', 'RELEVANT_RECOMMENDATION', 'TOP_3', 'TOP_1', 'STRONGLY_RECOMMENDED');--> statement-breakpoint
CREATE TYPE "public"."risk_tier" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('OBSERVED_API', 'SEARCH_EVIDENCE', 'INFERRED', 'HISTORICAL', 'OWN_PROPERTY', 'THIRD_PARTY', 'CUSTOMER_PROVIDED', 'SYNTHETIC');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('TRIALING', 'ACTIVE', 'PAST_DUE', 'GRACE', 'PAUSED', 'CANCELED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "business_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"label" text,
	"street" text,
	"house_number" text,
	"city" text NOT NULL,
	"neighborhood" text,
	"postal_code" text,
	"country" "country_code" DEFAULT 'IL' NOT NULL,
	"latitude" text,
	"longitude" text,
	"phone" text,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"rule_type" text NOT NULL,
	"value" text NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"website_url" text NOT NULL,
	"primary_domain" text NOT NULL,
	"vertical" text DEFAULT 'local_business' NOT NULL,
	"country" "country_code" DEFAULT 'IL' NOT NULL,
	"content_languages" jsonb DEFAULT '["he","en"]'::jsonb NOT NULL,
	"autonomy_mode" "autonomy_mode" DEFAULT 'RECOMMEND' NOT NULL,
	"goals" text,
	"onboarded_at" timestamp with time zone,
	"last_scan_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'VIEWER' NOT NULL,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"country" "country_code" DEFAULT 'IL' NOT NULL,
	"locale" text DEFAULT 'he-IL' NOT NULL,
	"timezone" text DEFAULT 'Asia/Jerusalem' NOT NULL,
	"parent_organization_id" uuid,
	"acquisition_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_verified_at" timestamp with time zone,
	"name" text,
	"password_hash" text,
	"mfa_secret_encrypted" text,
	"mfa_enabled_at" timestamp with time zone,
	"preferred_language" "language_code" DEFAULT 'he' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"is_platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"vertical" text,
	"category" text NOT NULL,
	"labels" jsonb NOT NULL,
	"evidence_terms" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"evidence_strength" real DEFAULT 0 NOT NULL,
	"supporting_fact_count" integer DEFAULT 0 NOT NULL,
	"distinct_source_count" integer DEFAULT 0 NOT NULL,
	"owner_confirmed" boolean DEFAULT false NOT NULL,
	"present_on_own_website" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_entities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"canonical_name" text NOT NULL,
	"localized_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"primary_category" text,
	"secondary_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"short_description" text,
	"completeness" real DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"fact_kind" text NOT NULL,
	"value" text,
	"value_json" jsonb,
	"language" text,
	"confidence" "confidence_level" DEFAULT 'UNKNOWN' NOT NULL,
	"status" "fact_status" DEFAULT 'ACTIVE' NOT NULL,
	"controllability" "controllability" DEFAULT 'CONTROLLED' NOT NULL,
	"attribute_id" uuid,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"superseded_by_fact_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitor_facts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"competitor_id" uuid NOT NULL,
	"fact_kind" text NOT NULL,
	"value" text,
	"attribute_id" uuid,
	"source_id" uuid,
	"source_type" "source_type" NOT NULL,
	"confidence" "confidence_level" DEFAULT 'LOW' NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"domain" text,
	"city" text,
	"discovery_source" text DEFAULT 'AI_RECOMMENDATION' NOT NULL,
	"recommendation_count" integer DEFAULT 0 NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fact_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"fact_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"confidence" "confidence_level" DEFAULT 'LOW' NOT NULL,
	"excerpt" text,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"domain" text NOT NULL,
	"source_kind" text DEFAULT 'other' NOT NULL,
	"title" text,
	"language" text,
	"authority_score" real,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp with time zone,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "prompt_attributes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"attribute_id" uuid NOT NULL,
	"weight" real DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"purpose" text DEFAULT 'MONITORING' NOT NULL,
	"generator_version" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"canonical_intent" text NOT NULL,
	"intent_category" text NOT NULL,
	"vertical" text NOT NULL,
	"language" "language_code" NOT NULL,
	"locale" text NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"neighborhood" text,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"commercial_intent" real DEFAULT 0 NOT NULL,
	"local_intent" real DEFAULT 0 NOT NULL,
	"specificity" real DEFAULT 0 NOT NULL,
	"ask_likelihood" real DEFAULT 0 NOT NULL,
	"prompt_score" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0.5 NOT NULL,
	"observed_value" real,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_recommendations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"competitor_id" uuid,
	"classification" "recommendation_class" NOT NULL,
	"position" integer,
	"accuracy" "accuracy_class" DEFAULT 'UNKNOWN' NOT NULL,
	"recognized_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence_quote" text,
	"evaluator_version" text NOT NULL,
	"confidence" "confidence_level" DEFAULT 'MEDIUM' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_responses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"response_text" text NOT NULL,
	"search_queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"extracted_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"position" integer,
	"references_business" boolean DEFAULT false NOT NULL,
	"referenced_competitor_id" uuid,
	"supports_attribute_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relevance" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hallucinations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"execution_id" uuid NOT NULL,
	"fact_kind" text NOT NULL,
	"stated_value" text,
	"actual_value" text,
	"issue_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"grounding_confidence" "confidence_level" NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"provider" "provider_id" NOT NULL,
	"model" text NOT NULL,
	"search_enabled" boolean DEFAULT false NOT NULL,
	"source_type" "source_type" NOT NULL,
	"country" text NOT NULL,
	"city" text,
	"language" text NOT NULL,
	"locale" text NOT NULL,
	"timezone" text NOT NULL,
	"latitude" text,
	"longitude" text,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'SUCCEEDED' NOT NULL,
	"error_code" text,
	"latency_ms" integer,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"agent_run_id" uuid,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "airs_scores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"prompt_set_id" uuid NOT NULL,
	"formula_version" text NOT NULL,
	"score" real NOT NULL,
	"components" jsonb NOT NULL,
	"inputs" jsonb NOT NULL,
	"confidence" "confidence_level" NOT NULL,
	"provider" text,
	"language" text,
	"engines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"execution_count" integer NOT NULL,
	"simulated" jsonb DEFAULT 'false'::jsonb NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"competitor_id" uuid,
	"prompt_set_id" uuid NOT NULL,
	"provider" text,
	"language" text,
	"prompts_evaluated" integer NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"recommendation_count" integer DEFAULT 0 NOT NULL,
	"top3_count" integer DEFAULT 0 NOT NULL,
	"top1_count" integer DEFAULT 0 NOT NULL,
	"citation_count" integer DEFAULT 0 NOT NULL,
	"recommendation_rate_lower" real DEFAULT 0 NOT NULL,
	"recommendation_rate_upper" real DEFAULT 1 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" uuid,
	"action_id" uuid,
	"agent_run_id" uuid,
	"change_target" text NOT NULL,
	"before_content" jsonb NOT NULL,
	"after_content" jsonb NOT NULL,
	"diff" text NOT NULL,
	"reason" text NOT NULL,
	"hypothesis" text,
	"publish_status" text DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"rollback_of_version_id" uuid,
	"approved_by_user_id" uuid,
	"connector_id" text NOT NULL,
	"connector_ref" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structured_data" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" uuid,
	"schema_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"grounded_fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid" boolean DEFAULT false NOT NULL,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technical_findings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" uuid,
	"crawl_id" uuid,
	"finding_type" text NOT NULL,
	"severity" text DEFAULT 'MEDIUM' NOT NULL,
	"detail" text,
	"confidence" real DEFAULT 1 NOT NULL,
	"auto_fixable" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_crawls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"root_url" text NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"pages_discovered" integer DEFAULT 0 NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"robots_txt_found" boolean DEFAULT false NOT NULL,
	"sitemap_found" boolean DEFAULT false NOT NULL,
	"audit" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "website_pages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"url" text NOT NULL,
	"canonical_url" text,
	"page_type" text DEFAULT 'other' NOT NULL,
	"title" text,
	"meta_description" text,
	"h1" text,
	"language" text,
	"status_code" integer,
	"indexable" boolean DEFAULT true NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"schema_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "website_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"crawl_id" uuid,
	"content_hash" text NOT NULL,
	"title" text,
	"meta_description" text,
	"headings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"body_text" text,
	"structured_data" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_graph" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hreflang" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"run_type" text NOT NULL,
	"status" "agent_run_status" DEFAULT 'RUNNING' NOT NULL,
	"autonomy_mode" text NOT NULL,
	"limits" jsonb NOT NULL,
	"iterations_used" integer DEFAULT 0 NOT NULL,
	"tool_calls_used" integer DEFAULT 0 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"spend_minor" integer DEFAULT 0 NOT NULL,
	"publish_operations" integer DEFAULT 0 NOT NULL,
	"stop_reason" text,
	"summary" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"agent_run_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"step_type" text NOT NULL,
	"tool_name" text,
	"input" jsonb,
	"output" jsonb,
	"reason" text,
	"duration_ms" integer,
	"cost_minor" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"prompt_set_id" uuid,
	"hypothesis" text NOT NULL,
	"intervention_type" text NOT NULL,
	"vertical" text NOT NULL,
	"status" "experiment_status" DEFAULT 'DRAFT' NOT NULL,
	"treatment_prompt_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"control_prompt_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"affected_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pre_treatment_trials" integer DEFAULT 0 NOT NULL,
	"pre_treatment_successes" integer DEFAULT 0 NOT NULL,
	"post_treatment_trials" integer DEFAULT 0 NOT NULL,
	"post_treatment_successes" integer DEFAULT 0 NOT NULL,
	"pre_control_trials" integer DEFAULT 0 NOT NULL,
	"pre_control_successes" integer DEFAULT 0 NOT NULL,
	"post_control_trials" integer DEFAULT 0 NOT NULL,
	"post_control_successes" integer DEFAULT 0 NOT NULL,
	"p_value" real,
	"conclusion" text,
	"conclusion_text" text,
	"confounders" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"observation_window_days" integer DEFAULT 14 NOT NULL,
	"change_applied_at" timestamp with time zone,
	"concluded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"dedupe_key" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"category" "action_category" NOT NULL,
	"controllability" "controllability" NOT NULL,
	"risk_tier" "risk_tier" DEFAULT 'LOW' NOT NULL,
	"status" "opportunity_status" DEFAULT 'OPEN' NOT NULL,
	"business_value" real DEFAULT 0 NOT NULL,
	"prompt_reach" integer DEFAULT 0 NOT NULL,
	"recommendation_gap" real DEFAULT 0 NOT NULL,
	"expected_lift" real DEFAULT 0 NOT NULL,
	"confidence" real DEFAULT 0 NOT NULL,
	"controllability_factor" real DEFAULT 1 NOT NULL,
	"estimated_cost" real DEFAULT 1 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attribute_id" uuid,
	"auto_fixable" boolean DEFAULT false NOT NULL,
	"dismissed_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"job_id" uuid,
	"opportunity_id" uuid,
	"experiment_id" uuid,
	"action_type" text NOT NULL,
	"category" "action_category" NOT NULL,
	"risk_tier" "risk_tier" NOT NULL,
	"status" "action_status" DEFAULT 'PROPOSED' NOT NULL,
	"summary" text NOT NULL,
	"rationale" text NOT NULL,
	"expected_impact" real DEFAULT 0 NOT NULL,
	"payload" jsonb NOT NULL,
	"grounded_fact_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"target_url" text,
	"content_version_id" uuid,
	"quality_gate" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approval_required" boolean DEFAULT true NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"rejected_reason" text,
	"applied_at" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "optimization_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"title" text NOT NULL,
	"diagnosis" text NOT NULL,
	"status" text DEFAULT 'PLANNED' NOT NULL,
	"planned_actions" integer DEFAULT 0 NOT NULL,
	"applied_actions" integer DEFAULT 0 NOT NULL,
	"failed_actions" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_cost_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"business_id" uuid,
	"provider" "provider_id",
	"provider_name" text NOT NULL,
	"endpoint" text NOT NULL,
	"model" text,
	"request_type" text NOT NULL,
	"job_id" uuid,
	"agent_run_id" uuid,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"search_count" integer DEFAULT 0 NOT NULL,
	"estimated_cost_minor" integer DEFAULT 0 NOT NULL,
	"actual_cost_minor" integer,
	"currency" "currency_code" DEFAULT 'ILS' NOT NULL,
	"duration_ms" integer,
	"status" text DEFAULT 'SUCCEEDED' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid,
	"scope" text NOT NULL,
	"limit_minor" integer NOT NULL,
	"currency" "currency_code" DEFAULT 'ILS' NOT NULL,
	"alert_threshold" real DEFAULT 0.8 NOT NULL,
	"spent_minor" integer DEFAULT 0 NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"alerted_at" timestamp with time zone,
	"exceeded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"subscription_id" uuid,
	"number" text NOT NULL,
	"currency" "currency_code" DEFAULT 'ILS' NOT NULL,
	"net_minor" integer NOT NULL,
	"vat_minor" integer NOT NULL,
	"gross_minor" integer NOT NULL,
	"vat_rate_bps" integer NOT NULL,
	"vat_period_id" text NOT NULL,
	"discount_minor" integer DEFAULT 0 NOT NULL,
	"refunded_minor" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"issued_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"provider_invoice_id" text,
	"line_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"monthly_net_minor" integer NOT NULL,
	"annual_net_minor" integer,
	"currency" "currency_code" DEFAULT 'ILS' NOT NULL,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"limits" jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "subscription_status" DEFAULT 'TRIALING' NOT NULL,
	"interval" text DEFAULT 'MONTHLY' NOT NULL,
	"provider_name" text DEFAULT 'mock' NOT NULL,
	"provider_customer_id" text,
	"provider_subscription_id" text,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"failed_payment_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid,
	"metric" text NOT NULL,
	"quantity" integer NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"actor_type" text NOT NULL,
	"impersonated_organization_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"data_class" "data_class" DEFAULT 'LOG_DATA' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deletion_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"user_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"reason" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"retained_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_for" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_flag_overrides" (
	"id" uuid PRIMARY KEY NOT NULL,
	"flag" text NOT NULL,
	"organization_id" uuid,
	"enabled" boolean,
	"rollout_percent" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"google_account_id" text,
	"refresh_token_encrypted" text,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_expires_at" timestamp with time zone,
	"status" text DEFAULT 'DISCONNECTED' NOT NULL,
	"automation_mode" text DEFAULT 'READ_ONLY' NOT NULL,
	"review_reply_enabled" boolean DEFAULT false NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"location_id" text NOT NULL,
	"place_id" text,
	"title" text,
	"primary_category" text,
	"categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"hours" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"phone" text,
	"website_uri" text,
	"address" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"verification_state" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"business_id" uuid,
	"job_type" text NOT NULL,
	"status" "job_status" DEFAULT 'QUEUED' NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"max_spend_minor" integer,
	"spend_minor" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid,
	"user_id" uuid,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'INFO' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"digest_key" text,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"business_id" uuid NOT NULL,
	"google_location_id" uuid,
	"external_id" text NOT NULL,
	"rating" integer,
	"language" text,
	"themes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sentiment" text,
	"has_owner_reply" boolean DEFAULT false NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "business_locations" ADD CONSTRAINT "business_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_locations" ADD CONSTRAINT "business_locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_rules" ADD CONSTRAINT "business_rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_attributes" ADD CONSTRAINT "business_attributes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_attributes" ADD CONSTRAINT "business_attributes_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_attributes" ADD CONSTRAINT "business_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_entities" ADD CONSTRAINT "business_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_entities" ADD CONSTRAINT "business_entities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_facts" ADD CONSTRAINT "business_facts_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_facts" ADD CONSTRAINT "competitor_facts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_facts" ADD CONSTRAINT "competitor_facts_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_facts" ADD CONSTRAINT "competitor_facts_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitor_facts" ADD CONSTRAINT "competitor_facts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitors" ADD CONSTRAINT "competitors_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sources" ADD CONSTRAINT "fact_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sources" ADD CONSTRAINT "fact_sources_fact_id_business_facts_id_fk" FOREIGN KEY ("fact_id") REFERENCES "public"."business_facts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fact_sources" ADD CONSTRAINT "fact_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_attributes" ADD CONSTRAINT "prompt_attributes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_attributes" ADD CONSTRAINT "prompt_attributes_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_attributes" ADD CONSTRAINT "prompt_attributes_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_sets" ADD CONSTRAINT "prompt_sets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_sets" ADD CONSTRAINT "prompt_sets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_responses" ADD CONSTRAINT "ai_responses_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_referenced_competitor_id_competitors_id_fk" FOREIGN KEY ("referenced_competitor_id") REFERENCES "public"."competitors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallucinations" ADD CONSTRAINT "hallucinations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallucinations" ADD CONSTRAINT "hallucinations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hallucinations" ADD CONSTRAINT "hallucinations_execution_id_prompt_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."prompt_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD CONSTRAINT "prompt_executions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD CONSTRAINT "prompt_executions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD CONSTRAINT "prompt_executions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_executions" ADD CONSTRAINT "prompt_executions_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airs_scores" ADD CONSTRAINT "airs_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airs_scores" ADD CONSTRAINT "airs_scores_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airs_scores" ADD CONSTRAINT "airs_scores_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_shares" ADD CONSTRAINT "recommendation_shares_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_shares" ADD CONSTRAINT "recommendation_shares_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_shares" ADD CONSTRAINT "recommendation_shares_competitor_id_competitors_id_fk" FOREIGN KEY ("competitor_id") REFERENCES "public"."competitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_shares" ADD CONSTRAINT "recommendation_shares_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_data" ADD CONSTRAINT "structured_data_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_data" ADD CONSTRAINT "structured_data_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_data" ADD CONSTRAINT "structured_data_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_findings" ADD CONSTRAINT "technical_findings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_findings" ADD CONSTRAINT "technical_findings_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_findings" ADD CONSTRAINT "technical_findings_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_findings" ADD CONSTRAINT "technical_findings_crawl_id_website_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."website_crawls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_crawls" ADD CONSTRAINT "website_crawls_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_crawls" ADD CONSTRAINT "website_crawls_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_pages" ADD CONSTRAINT "website_pages_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_snapshots" ADD CONSTRAINT "website_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_snapshots" ADD CONSTRAINT "website_snapshots_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_snapshots" ADD CONSTRAINT "website_snapshots_page_id_website_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."website_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_snapshots" ADD CONSTRAINT "website_snapshots_crawl_id_website_crawls_id_fk" FOREIGN KEY ("crawl_id") REFERENCES "public"."website_crawls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_agent_run_id_agent_runs_id_fk" FOREIGN KEY ("agent_run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_prompt_set_id_prompt_sets_id_fk" FOREIGN KEY ("prompt_set_id") REFERENCES "public"."prompt_sets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_attribute_id_attributes_id_fk" FOREIGN KEY ("attribute_id") REFERENCES "public"."attributes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_job_id_optimization_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."optimization_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_jobs" ADD CONSTRAINT "optimization_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_jobs" ADD CONSTRAINT "optimization_jobs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_cost_records" ADD CONSTRAINT "api_cost_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_cost_records" ADD CONSTRAINT "api_cost_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_requests" ADD CONSTRAINT "deletion_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_flag_overrides" ADD CONSTRAINT "feature_flag_overrides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_connections" ADD CONSTRAINT "google_connections_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_locations" ADD CONSTRAINT "google_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_locations" ADD CONSTRAINT "google_locations_connection_id_google_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."google_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_locations" ADD CONSTRAINT "google_locations_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "public"."businesses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_google_location_id_google_locations_id_fk" FOREIGN KEY ("google_location_id") REFERENCES "public"."google_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "business_locations_business_idx" ON "business_locations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_locations_org_idx" ON "business_locations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "business_rules_business_idx" ON "business_rules" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_rules_unique" ON "business_rules" USING btree ("business_id","rule_type","value");--> statement-breakpoint
CREATE INDEX "businesses_org_idx" ON "businesses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "businesses_domain_idx" ON "businesses" USING btree ("primary_domain");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_org_user_key" ON "memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizations_parent_idx" ON "organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "attributes_key_vertical_key" ON "attributes" USING btree ("key","vertical");--> statement-breakpoint
CREATE INDEX "attributes_category_idx" ON "attributes" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "business_attributes_unique" ON "business_attributes" USING btree ("business_id","attribute_id");--> statement-breakpoint
CREATE INDEX "business_attributes_org_idx" ON "business_attributes" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_entities_business_key" ON "business_entities" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "business_entities_org_idx" ON "business_entities" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "business_facts_business_kind_idx" ON "business_facts" USING btree ("business_id","fact_kind");--> statement-breakpoint
CREATE INDEX "business_facts_org_idx" ON "business_facts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "business_facts_attribute_idx" ON "business_facts" USING btree ("attribute_id");--> statement-breakpoint
CREATE INDEX "business_facts_status_idx" ON "business_facts" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "competitor_facts_competitor_idx" ON "competitor_facts" USING btree ("competitor_id");--> statement-breakpoint
CREATE INDEX "competitor_facts_attribute_idx" ON "competitor_facts" USING btree ("attribute_id");--> statement-breakpoint
CREATE INDEX "competitor_facts_org_idx" ON "competitor_facts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "competitors_business_name_key" ON "competitors" USING btree ("business_id","name");--> statement-breakpoint
CREATE INDEX "competitors_org_idx" ON "competitors" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "competitors_business_idx" ON "competitors" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fact_sources_unique" ON "fact_sources" USING btree ("fact_id","source_id");--> statement-breakpoint
CREATE INDEX "fact_sources_source_idx" ON "fact_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "fact_sources_org_idx" ON "fact_sources" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_url_key" ON "sources" USING btree ("url");--> statement-breakpoint
CREATE INDEX "sources_domain_idx" ON "sources" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "sources_kind_idx" ON "sources" USING btree ("source_kind");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_attributes_unique" ON "prompt_attributes" USING btree ("prompt_id","attribute_id");--> statement-breakpoint
CREATE INDEX "prompt_attributes_attribute_idx" ON "prompt_attributes" USING btree ("attribute_id");--> statement-breakpoint
CREATE INDEX "prompt_sets_business_idx" ON "prompt_sets" USING btree ("business_id");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_sets_business_name_version_key" ON "prompt_sets" USING btree ("business_id","name","version");--> statement-breakpoint
CREATE INDEX "prompts_set_idx" ON "prompts" USING btree ("prompt_set_id");--> statement-breakpoint
CREATE INDEX "prompts_business_active_idx" ON "prompts" USING btree ("business_id","active");--> statement-breakpoint
CREATE INDEX "prompts_intent_idx" ON "prompts" USING btree ("canonical_intent");--> statement-breakpoint
CREATE INDEX "prompts_score_idx" ON "prompts" USING btree ("business_id","prompt_score");--> statement-breakpoint
CREATE UNIQUE INDEX "prompts_set_query_key" ON "prompts" USING btree ("prompt_set_id","query_text");--> statement-breakpoint
CREATE INDEX "ai_recommendations_business_idx" ON "ai_recommendations" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_recommendations_execution_idx" ON "ai_recommendations" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "ai_recommendations_prompt_idx" ON "ai_recommendations" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "ai_recommendations_competitor_idx" ON "ai_recommendations" USING btree ("competitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_recommendations_unique_subject" ON "ai_recommendations" USING btree ("execution_id","business_id","competitor_id","evaluator_version");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_responses_execution_key" ON "ai_responses" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "ai_responses_org_idx" ON "ai_responses" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "citations_execution_idx" ON "citations" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "citations_source_idx" ON "citations" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "citations_org_idx" ON "citations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "hallucinations_business_idx" ON "hallucinations" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "hallucinations_execution_idx" ON "hallucinations" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "prompt_executions_business_time_idx" ON "prompt_executions" USING btree ("business_id","executed_at");--> statement-breakpoint
CREATE INDEX "prompt_executions_prompt_idx" ON "prompt_executions" USING btree ("prompt_id","executed_at");--> statement-breakpoint
CREATE INDEX "prompt_executions_set_idx" ON "prompt_executions" USING btree ("prompt_set_id");--> statement-breakpoint
CREATE INDEX "prompt_executions_org_idx" ON "prompt_executions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "airs_scores_business_time_idx" ON "airs_scores" USING btree ("business_id","calculated_at");--> statement-breakpoint
CREATE INDEX "airs_scores_set_idx" ON "airs_scores" USING btree ("prompt_set_id");--> statement-breakpoint
CREATE INDEX "airs_scores_org_idx" ON "airs_scores" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "recommendation_shares_business_idx" ON "recommendation_shares" USING btree ("business_id","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recommendation_shares_unique" ON "recommendation_shares" USING btree ("prompt_set_id","business_id","competitor_id","provider","language","window_start","window_end");--> statement-breakpoint
CREATE INDEX "content_versions_business_idx" ON "content_versions" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "content_versions_page_idx" ON "content_versions" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "content_versions_status_idx" ON "content_versions" USING btree ("business_id","publish_status");--> statement-breakpoint
CREATE INDEX "content_versions_action_idx" ON "content_versions" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "structured_data_business_idx" ON "structured_data" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "structured_data_page_idx" ON "structured_data" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "technical_findings_business_idx" ON "technical_findings" USING btree ("business_id","finding_type");--> statement-breakpoint
CREATE INDEX "technical_findings_open_idx" ON "technical_findings" USING btree ("business_id","resolved_at");--> statement-breakpoint
CREATE INDEX "website_crawls_business_idx" ON "website_crawls" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "website_pages_business_url_key" ON "website_pages" USING btree ("business_id","url");--> statement-breakpoint
CREATE INDEX "website_pages_business_type_idx" ON "website_pages" USING btree ("business_id","page_type");--> statement-breakpoint
CREATE INDEX "website_snapshots_page_time_idx" ON "website_snapshots" USING btree ("page_id","captured_at");--> statement-breakpoint
CREATE INDEX "website_snapshots_hash_idx" ON "website_snapshots" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "agent_runs_business_idx" ON "agent_runs" USING btree ("business_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_steps_run_seq_key" ON "agent_steps" USING btree ("agent_run_id","sequence");--> statement-breakpoint
CREATE INDEX "experiments_business_idx" ON "experiments" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "experiments_intervention_idx" ON "experiments" USING btree ("intervention_type","vertical");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_dedupe_key" ON "opportunities" USING btree ("business_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "opportunities_business_score_idx" ON "opportunities" USING btree ("business_id","status","score");--> statement-breakpoint
CREATE INDEX "optimization_actions_business_status_idx" ON "optimization_actions" USING btree ("business_id","status");--> statement-breakpoint
CREATE INDEX "optimization_actions_job_idx" ON "optimization_actions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "optimization_actions_experiment_idx" ON "optimization_actions" USING btree ("experiment_id");--> statement-breakpoint
CREATE INDEX "optimization_jobs_business_idx" ON "optimization_jobs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE INDEX "api_cost_records_org_time_idx" ON "api_cost_records" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "api_cost_records_provider_idx" ON "api_cost_records" USING btree ("provider_name","created_at");--> statement-breakpoint
CREATE INDEX "api_cost_records_run_idx" ON "api_cost_records" USING btree ("agent_run_id");--> statement-breakpoint
CREATE INDEX "budgets_org_scope_idx" ON "budgets" USING btree ("organization_id","scope","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_unique" ON "budgets" USING btree ("organization_id","business_id","scope","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices" USING btree ("number");--> statement-breakpoint
CREATE INDEX "invoices_org_idx" ON "invoices" USING btree ("organization_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_code_key" ON "plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "subscriptions_org_idx" ON "subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "usage_records_org_metric_idx" ON "usage_records" USING btree ("organization_id","metric","period_start");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_bucket_key" ON "usage_records" USING btree ("organization_id","business_id","metric","period_start");--> statement-breakpoint
CREATE INDEX "audit_logs_org_time_idx" ON "audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "deletion_requests_status_idx" ON "deletion_requests" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flag_overrides_key" ON "feature_flag_overrides" USING btree ("flag","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_connections_business_key" ON "google_connections" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "google_connections_org_idx" ON "google_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "google_locations_connection_location_key" ON "google_locations" USING btree ("connection_id","location_id");--> statement-breakpoint
CREATE INDEX "google_locations_business_idx" ON "google_locations" USING btree ("business_id");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "jobs_business_idx" ON "jobs" USING btree ("business_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_org_idx" ON "notifications" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_unread_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_external_key" ON "reviews" USING btree ("business_id","external_id");--> statement-breakpoint
CREATE INDEX "reviews_business_idx" ON "reviews" USING btree ("business_id","reviewed_at");