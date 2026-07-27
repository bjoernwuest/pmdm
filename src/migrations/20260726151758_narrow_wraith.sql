CREATE TABLE "script_log" (
	"identifier" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"log_level" text NOT NULL,
	"message" text NOT NULL,
	"script_category" text NOT NULL,
	"data_type_identifier" uuid,
	"product_request_identifier" uuid,
	"principal_user_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
