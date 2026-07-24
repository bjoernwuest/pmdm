CREATE TABLE "api_key_functional_permissions" (
	"api_key_identifier" uuid NOT NULL,
	"functional_permission_identifier" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_key_functional_permissions_pkey" PRIMARY KEY("api_key_identifier","functional_permission_identifier")
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"key_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp NOT NULL,
	"last_prolonged_at" timestamp,
	"last_prolonged_by" uuid,
	"disabled" boolean DEFAULT false NOT NULL,
	"disabled_at" timestamp,
	"disabled_by" uuid
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_domains" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "config" (
	"domain" varchar(255) NOT NULL,
	"key" varchar(255) NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"value" jsonb,
	"edit_in_ui" boolean DEFAULT true NOT NULL,
	"input_format" text DEFAULT '' NOT NULL,
	"output_format" text DEFAULT '' NOT NULL,
	"mandatory_for_start" boolean DEFAULT false NOT NULL,
	"user_profile" boolean DEFAULT false NOT NULL,
	CONSTRAINT "config_domain_key_pk" PRIMARY KEY("domain","key")
);
--> statement-breakpoint
CREATE TABLE "consumables" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "consumables_values" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"is_used" boolean DEFAULT false NOT NULL,
	"consumable_identifier" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_types_permissions" (
	"data_type_identifier" uuid NOT NULL,
	"group_identifier" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"show_by_default" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_types" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"kind" text NOT NULL,
	"mandatory" text NOT NULL,
	"mandatory_script" text,
	"requestor_can_edit" text NOT NULL,
	"requestor_can_edit_script" text,
	"config" jsonb NOT NULL,
	"owner" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "functional_permissions" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"functional_permission_name" text NOT NULL,
	"description" text NOT NULL,
	"group" text DEFAULT 'General' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "functional_permissions_functional_permission_name_unique" UNIQUE("functional_permission_name")
);
--> statement-breakpoint
CREATE TABLE "functional_permissions_of_group" (
	"functional_permission_identifier" uuid NOT NULL,
	"granted_to" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	CONSTRAINT "functional_permissions_of_group_pkey" PRIMARY KEY("functional_permission_identifier","granted_to")
);
--> statement-breakpoint
CREATE TABLE "lookup" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"source_system" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lookup_values" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"source_system_identifier" text,
	"lookup_identifier" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_exports" (
	"product_request" uuid,
	"target_system" uuid,
	"exported_by" uuid,
	"exported_at" timestamp,
	"imported_by" uuid,
	"imported_at" timestamp,
	CONSTRAINT "product_exports_product_request_target_system_pk" PRIMARY KEY("product_request","target_system")
);
--> statement-breakpoint
CREATE TABLE "product_number_state" (
	"locked" boolean PRIMARY KEY DEFAULT false NOT NULL,
	"notes" text DEFAULT 'Sentinel row for atomic product number generation'
);
--> statement-breakpoint
CREATE TABLE "product_requests" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"product_type" uuid,
	"product_number" text NOT NULL,
	"product_to_update_from" text,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_requests_values" (
	"data_type" uuid,
	"product_request" uuid,
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"approvated_at" timestamp,
	"approved_by" uuid,
	"default_value" jsonb DEFAULT 'null',
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "products" (
	"product_type_identifier" uuid NOT NULL,
	"product_number" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products_values" (
	"product_number" text NOT NULL,
	"data_type_identifier" uuid NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "product_types" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"requestor_can_cancel" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types_data_types_permissions" (
	"product_type_data_type_identifier" uuid NOT NULL,
	"group_identifier" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	"show_by_default" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types_data_types_previous_approval" (
	"product_type" uuid NOT NULL,
	"data_type" uuid NOT NULL,
	"depends_on_data_type" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types_data_types" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"product_type" uuid NOT NULL,
	"data_type" uuid NOT NULL,
	"mandatory" text,
	"mandatory_script" text,
	"requestor_can_edit" text,
	"requestor_can_edit_script" text,
	"config" jsonb,
	"owner" uuid,
	"editable_on_update" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_types_data_types_target_systems" (
	"product_type" uuid NOT NULL,
	"data_type" uuid NOT NULL,
	"target_system" uuid NOT NULL,
	"name" text
);
--> statement-breakpoint
CREATE TABLE "product_types_permissions" (
	"product_type_identifier" uuid NOT NULL,
	"group_identifier" uuid NOT NULL,
	"role" text DEFAULT 'cancel' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_systems" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_profile_config" (
	"domain" varchar(255) NOT NULL,
	"key" varchar(255) NOT NULL,
	"user_identifier" uuid NOT NULL,
	"value" jsonb,
	CONSTRAINT "user_profile_config_pk" PRIMARY KEY("domain","key","user_identifier")
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"group_name" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"user_identifier" uuid NOT NULL,
	"group_identifier" uuid NOT NULL,
	CONSTRAINT "user_groups_user_identifier_group_identifier_pk" PRIMARY KEY("user_identifier","group_identifier")
);
--> statement-breakpoint
ALTER TABLE "api_key_functional_permissions" ADD CONSTRAINT "api_key_functional_permissions_api_key_identifier_api_keys_identifier_fk" FOREIGN KEY ("api_key_identifier") REFERENCES "public"."api_keys"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_functional_permissions" ADD CONSTRAINT "api_key_functional_permissions_functional_permission_identifier_functional_permissions_identifier_fk" FOREIGN KEY ("functional_permission_identifier") REFERENCES "public"."functional_permissions"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_functional_permissions" ADD CONSTRAINT "api_key_functional_permissions_granted_by_users_identifier_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("identifier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_last_prolonged_by_users_identifier_fk" FOREIGN KEY ("last_prolonged_by") REFERENCES "public"."users"("identifier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_disabled_by_users_identifier_fk" FOREIGN KEY ("disabled_by") REFERENCES "public"."users"("identifier") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_domains" ADD CONSTRAINT "business_domains_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "business_domains" ADD CONSTRAINT "business_domains_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumables" ADD CONSTRAINT "consumables_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumables_values" ADD CONSTRAINT "consumables_values_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumables_values" ADD CONSTRAINT "consumables_values_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "consumables_values" ADD CONSTRAINT "consumables_values_consumable_identifier_consumables_identifier_fk" FOREIGN KEY ("consumable_identifier") REFERENCES "public"."consumables"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types_permissions" ADD CONSTRAINT "data_types_permissions_data_type_identifier_data_types_identifier_fk" FOREIGN KEY ("data_type_identifier") REFERENCES "public"."data_types"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types_permissions" ADD CONSTRAINT "data_types_permissions_group_identifier_groups_identifier_fk" FOREIGN KEY ("group_identifier") REFERENCES "public"."groups"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types_permissions" ADD CONSTRAINT "data_types_permissions_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types" ADD CONSTRAINT "data_types_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types" ADD CONSTRAINT "data_types_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "data_types" ADD CONSTRAINT "data_types_owner_business_domains_identifier_fk" FOREIGN KEY ("owner") REFERENCES "public"."business_domains"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "functional_permissions_of_group" ADD CONSTRAINT "func_perms_of_group_permission_fkey" FOREIGN KEY ("functional_permission_identifier") REFERENCES "public"."functional_permissions"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_permissions_of_group" ADD CONSTRAINT "func_perms_of_group_granted_to_fkey" FOREIGN KEY ("granted_to") REFERENCES "public"."groups"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functional_permissions_of_group" ADD CONSTRAINT "func_perms_of_group_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lookup" ADD CONSTRAINT "lookup_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lookup" ADD CONSTRAINT "lookup_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "lookup_values" ADD CONSTRAINT "lookup_values_lookup_identifier_lookup_identifier_fk" FOREIGN KEY ("lookup_identifier") REFERENCES "public"."lookup"("identifier") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "product_exports" ADD CONSTRAINT "product_exports_product_request_product_requests_identifier_fk" FOREIGN KEY ("product_request") REFERENCES "public"."product_requests"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_exports" ADD CONSTRAINT "product_exports_target_system_target_systems_identifier_fk" FOREIGN KEY ("target_system") REFERENCES "public"."target_systems"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_exports" ADD CONSTRAINT "product_exports_exported_by_users_identifier_fk" FOREIGN KEY ("exported_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_exports" ADD CONSTRAINT "product_exports_imported_by_users_identifier_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_product_type_product_types_identifier_fk" FOREIGN KEY ("product_type") REFERENCES "public"."product_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_product_to_update_from_products_product_number_fk" FOREIGN KEY ("product_to_update_from") REFERENCES "public"."products"("product_number") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests_values" ADD CONSTRAINT "product_requests_values_data_type_data_types_identifier_fk" FOREIGN KEY ("data_type") REFERENCES "public"."data_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests_values" ADD CONSTRAINT "product_requests_values_product_request_product_requests_identifier_fk" FOREIGN KEY ("product_request") REFERENCES "public"."product_requests"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests_values" ADD CONSTRAINT "product_requests_values_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests_values" ADD CONSTRAINT "product_requests_values_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_requests_values" ADD CONSTRAINT "product_requests_values_approved_by_users_identifier_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_product_type_identifier_product_types_identifier_fk" FOREIGN KEY ("product_type_identifier") REFERENCES "public"."product_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products_values" ADD CONSTRAINT "products_values_product_number_products_product_number_fk" FOREIGN KEY ("product_number") REFERENCES "public"."products"("product_number") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "products_values" ADD CONSTRAINT "products_values_data_type_identifier_data_types_identifier_fk" FOREIGN KEY ("data_type_identifier") REFERENCES "public"."data_types"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types" ADD CONSTRAINT "product_types_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_permissions" ADD CONSTRAINT "product_types_data_types_permissions_product_type_data_type_identifier_product_types_data_types_identifier_fk" FOREIGN KEY ("product_type_data_type_identifier") REFERENCES "public"."product_types_data_types"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_permissions" ADD CONSTRAINT "product_types_data_types_permissions_group_identifier_groups_identifier_fk" FOREIGN KEY ("group_identifier") REFERENCES "public"."groups"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_permissions" ADD CONSTRAINT "product_types_data_types_permissions_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_previous_approval" ADD CONSTRAINT "product_types_data_types_previous_approval_product_type_product_types_identifier_fk" FOREIGN KEY ("product_type") REFERENCES "public"."product_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_previous_approval" ADD CONSTRAINT "product_types_data_types_previous_approval_data_type_data_types_identifier_fk" FOREIGN KEY ("data_type") REFERENCES "public"."data_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_previous_approval" ADD CONSTRAINT "product_types_data_types_previous_approval_depends_on_data_type_data_types_identifier_fk" FOREIGN KEY ("depends_on_data_type") REFERENCES "public"."data_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types" ADD CONSTRAINT "product_types_data_types_product_type_product_types_identifier_fk" FOREIGN KEY ("product_type") REFERENCES "public"."product_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types" ADD CONSTRAINT "product_types_data_types_data_type_data_types_identifier_fk" FOREIGN KEY ("data_type") REFERENCES "public"."data_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types" ADD CONSTRAINT "product_types_data_types_owner_business_domains_identifier_fk" FOREIGN KEY ("owner") REFERENCES "public"."business_domains"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_target_systems" ADD CONSTRAINT "product_types_data_types_target_systems_product_type_product_types_identifier_fk" FOREIGN KEY ("product_type") REFERENCES "public"."product_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_target_systems" ADD CONSTRAINT "product_types_data_types_target_systems_data_type_data_types_identifier_fk" FOREIGN KEY ("data_type") REFERENCES "public"."data_types"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_data_types_target_systems" ADD CONSTRAINT "product_types_data_types_target_systems_target_system_target_systems_identifier_fk" FOREIGN KEY ("target_system") REFERENCES "public"."target_systems"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_permissions" ADD CONSTRAINT "product_types_permissions_product_type_identifier_product_types_identifier_fk" FOREIGN KEY ("product_type_identifier") REFERENCES "public"."product_types"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_permissions" ADD CONSTRAINT "product_types_permissions_group_identifier_groups_identifier_fk" FOREIGN KEY ("group_identifier") REFERENCES "public"."groups"("identifier") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "product_types_permissions" ADD CONSTRAINT "product_types_permissions_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "target_systems" ADD CONSTRAINT "target_systems_created_by_users_identifier_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "target_systems" ADD CONSTRAINT "target_systems_updated_by_users_identifier_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("identifier") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_profile_config" ADD CONSTRAINT "user_profile_config_user_identifier_users_identifier_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_user_identifier_users_identifier_fk" FOREIGN KEY ("user_identifier") REFERENCES "public"."users"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_group_identifier_groups_identifier_fk" FOREIGN KEY ("group_identifier") REFERENCES "public"."groups"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ux_business_domain_name_ci" ON "business_domains" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_consumables_name_ci" ON "consumables" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_unique_name_per_consumable" ON "consumables_values" USING btree ("consumable_identifier",lower("name"));--> statement-breakpoint
CREATE INDEX "ix_search_unused_values" ON "consumables_values" USING btree ("consumable_identifier","is_used");--> statement-breakpoint
CREATE INDEX "ix_search_disabled_values" ON "consumables_values" USING btree ("consumable_identifier","disabled");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_datatype_permission_assignment" ON "data_types_permissions" USING btree ("data_type_identifier","group_identifier","role");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_datatype_name_ci" ON "data_types" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_lookup_name_ci" ON "lookup" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_lookup_values_type_name_ci" ON "lookup_values" USING btree ("lookup_identifier",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_requests_active_product_number" ON "product_requests" USING btree ("product_number") WHERE "product_requests"."status" IN ('open', 'importing');--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_requests_active_product_to_update" ON "product_requests" USING btree ("product_to_update_from") WHERE "product_requests"."status" IN ('open', 'importing');--> statement-breakpoint
CREATE UNIQUE INDEX "product_requests_values_product_request_data_type_index" ON "product_requests_values" USING btree ("product_request","data_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_alt_number_ci" ON "products" USING btree (lower("product_number"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_data" ON "products_values" USING btree ("product_number","data_type_identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_types_name_ci" ON "product_types" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_types_data_types_permissions" ON "product_types_data_types_permissions" USING btree ("product_type_data_type_identifier","group_identifier","role");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_types_data_types_previous_approval" ON "product_types_data_types_previous_approval" USING btree ("product_type","data_type","depends_on_data_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_types_data_types_ci" ON "product_types_data_types" USING btree ("product_type","data_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_product_types_data_types_target_systems" ON "product_types_data_types_target_systems" USING btree ("product_type","data_type","target_system");--> statement-breakpoint
CREATE UNIQUE INDEX "ux_target_systems_name_ci" ON "target_systems" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "group_disabled_idx" ON "groups" USING btree ("disabled");--> statement-breakpoint
CREATE INDEX "user_disabled_idx" ON "users" USING btree ("disabled");