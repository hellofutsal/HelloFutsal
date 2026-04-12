--
-- PostgreSQL database dump
--

\restrict HQ4ixD3nOm65Tfog41XLZEDBzXJHeMKdBuh6ZbLKqrd98WGbYYb5DVw5IH3MfBM

-- Dumped from database version 17.8 (a48d9ca)
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.admins (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_name character varying NOT NULL,
    email character varying,
    password_hash character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    mobile_number character varying,
    CONSTRAINT "CHK_admins_email_or_mobile_number" CHECK (((email IS NOT NULL) OR (mobile_number IS NOT NULL)))
);


ALTER TABLE public.admins OWNER TO neondb_owner;

--
-- Name: field_rule_books; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.field_rule_books (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    field_id uuid NOT NULL,
    rule_name character varying NOT NULL,
    slot_selection_type character varying NOT NULL,
    action_type character varying NOT NULL,
    value numeric(12,2) NOT NULL,
    rule_config jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.field_rule_books OWNER TO neondb_owner;

--
-- Name: field_schedule_settings; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.field_schedule_settings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    field_id uuid NOT NULL,
    slot_duration_min integer DEFAULT 60 NOT NULL,
    break_between_min integer DEFAULT 15 NOT NULL,
    base_price numeric(12,2) DEFAULT 120.00 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    opening_time time without time zone DEFAULT '06:00:00'::time without time zone NOT NULL,
    closing_time time without time zone DEFAULT '23:00:00'::time without time zone NOT NULL
);


ALTER TABLE public.field_schedule_settings OWNER TO neondb_owner;

--
-- Name: fields; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.fields (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    venue_name character varying NOT NULL,
    city character varying,
    address character varying,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    field_name character varying NOT NULL,
    player_capacity integer DEFAULT 20 NOT NULL
);


ALTER TABLE public.fields OWNER TO neondb_owner;

--
-- Name: migrations; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);


ALTER TABLE public.migrations OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: neondb_owner
--

CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.migrations_id_seq OWNER TO neondb_owner;

--
-- Name: migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: neondb_owner
--

ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;


--
-- Name: signup_otp_requests; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.signup_otp_requests (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    identifier character varying NOT NULL,
    identifier_type character varying NOT NULL,
    account_type character varying NOT NULL,
    display_name character varying,
    password_hash character varying NOT NULL,
    otp_hash character varying NOT NULL,
    raw_otp character varying,
    expires_at timestamp without time zone NOT NULL,
    attempts integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    mobile_number character varying
);


ALTER TABLE public.signup_otp_requests OWNER TO neondb_owner;

--
-- Name: users; Type: TABLE; Schema: public; Owner: neondb_owner
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    full_name character varying,
    email character varying,
    password_hash character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    mobile_number character varying,
    username character varying
);


ALTER TABLE public.users OWNER TO neondb_owner;

--
-- Name: migrations id; Type: DEFAULT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.admins (id, owner_name, email, password_hash, created_at, updated_at, mobile_number) FROM stdin;
efec3a15-ba42-4162-b1bc-5460be2f5218	Ayush Adhikari Prod	ayush1@gmail.com	$2a$12$fRda768.UVvbKz7WsLAN8.Wc04gI09agHb0WkjrJJe6KNxsNevpjm	2026-04-09 08:40:26.486916	2026-04-09 08:40:26.486916	\N
a5ee5d4f-0897-4aa4-bbac-f5ed41bd474f	Ayush Adhikari Cron Job Test	\N	$2a$12$9ftqumZp/v7xkXBr2CHgPuVJIpYmgUJPbdY5cmdhT8v5M3RRGLLne	2026-04-11 13:37:35.034879	2026-04-11 13:37:35.034879	9812345678
\.


--
-- Data for Name: field_rule_books; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.field_rule_books (id, field_id, rule_name, slot_selection_type, action_type, value, rule_config, is_active, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: field_schedule_settings; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.field_schedule_settings (id, field_id, slot_duration_min, break_between_min, base_price, created_at, updated_at, opening_time, closing_time) FROM stdin;
\.


--
-- Data for Name: fields; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.fields (id, owner_id, venue_name, city, address, description, is_active, created_at, updated_at, field_name, player_capacity) FROM stdin;
\.


--
-- Data for Name: migrations; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.migrations (id, "timestamp", name) FROM stdin;
1	1743768000000	InitialSchema1743768000000
2	1743779700000	UserEmailOrMobile1743779700000
3	1743783300000	UserSignupOtpRequests1743783300000
4	1743810000000	UsernameAndAdminOnboardingFields1743810000000
5	1743813600000	AdminSignupOtpRequests1743813600000
6	1743820000000	ConsolidateSignupOtpRequests1743820000000
7	1743823600000	AddRawOtpToSignupOtpRequests1743823600000
8	1743827200000	RelaxRawOtpAndCleanupBackfill1743827200000
9	1775699245051	AddUserProfile1775699245051
10	1775706000000	CreateFieldsTable1775706000000
11	1775710800000	FieldsCaseInsensitiveNameUnique1775710800000
12	1775714400000	AddMobileNumberToGroundOwnersAndSignupOtpRequests1775714400000
13	1775720000000	UpdateFieldsTableStructure1775720000000
14	1775727200000	DropAdminsGroundName1775727200000
15	1775729000000	CreateFieldScheduleSettings1775729000000
16	1775730000000	CreateFieldSlots1775730000000
17	1775731000000	CreateFieldRuleBooks1775731000000
18	1775732000000	AddOperatingHoursToFieldScheduleSettings1775732000000
\.


--
-- Data for Name: signup_otp_requests; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.signup_otp_requests (id, identifier, identifier_type, account_type, display_name, password_hash, otp_hash, raw_otp, expires_at, attempts, created_at, updated_at, mobile_number) FROM stdin;
5d8485a7-2456-46a3-b073-4ecc226e94c7	ayush54@gmail.com	email	admin	Ayush Adhikari	$2a$12$SOWKdCZ5MBmXZPBEXPNLXuDEm./TrwgTgvyrDgsUex53ejXv7VUIG	$2a$12$b6r4ljfI97SzgGyDYqnWmuogkHFmrz1CJQrLXy0SrkuUuD7AE6iI2	\N	2026-04-09 07:59:35.581	0	2026-04-09 07:54:35.612946	2026-04-09 07:54:35.612946	\N
22e037d9-631c-4305-ba15-557caaa755d6	9749865300	mobile	admin	minraz	$2a$12$3phPhpsTQkQDPC8XZzNaZuXulKjD4mWwFvkH4EQAD3pRSAERQEvoG	$2a$12$4AmS.GhtCeFHZqTLNlPxOOhMLrnl69pW7fxofb6A5RF1Q0GX0QDIa	819736	2026-04-12 08:00:41.515	0	2026-04-12 07:55:41.552742	2026-04-12 07:55:41.552742	9749865300
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: neondb_owner
--

COPY public.users (id, full_name, email, password_hash, created_at, updated_at, mobile_number, username) FROM stdin;
\.


--
-- Name: migrations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: neondb_owner
--

SELECT pg_catalog.setval('public.migrations_id_seq', 18, true);


--
-- Name: migrations PK_8c82d7f526340ab734260ea46be; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: admins PK_e3b38270c97a854c48d2e80874e; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT "PK_e3b38270c97a854c48d2e80874e" PRIMARY KEY (id);


--
-- Name: field_rule_books PK_field_rule_books_id; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_rule_books
    ADD CONSTRAINT "PK_field_rule_books_id" PRIMARY KEY (id);


--
-- Name: field_schedule_settings PK_field_schedule_settings_id; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_schedule_settings
    ADD CONSTRAINT "PK_field_schedule_settings_id" PRIMARY KEY (id);


--
-- Name: fields PK_fields_id; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT "PK_fields_id" PRIMARY KEY (id);


--
-- Name: admins UQ_051db7d37d478a69a7432df1479; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT "UQ_051db7d37d478a69a7432df1479" UNIQUE (email);


--
-- Name: users UQ_350c2c34c6fdd4b292ab6e77879; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_350c2c34c6fdd4b292ab6e77879" UNIQUE (mobile_number);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: users UQ_fe0bb3f6520ee0469504521e710; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username);


--
-- Name: field_rule_books UQ_field_rule_books_field_rule_name; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_rule_books
    ADD CONSTRAINT "UQ_field_rule_books_field_rule_name" UNIQUE (field_id, rule_name);


--
-- Name: field_schedule_settings UQ_field_schedule_settings_field_id; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_schedule_settings
    ADD CONSTRAINT "UQ_field_schedule_settings_field_id" UNIQUE (field_id);


--
-- Name: signup_otp_requests signup_otp_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.signup_otp_requests
    ADD CONSTRAINT signup_otp_requests_pkey PRIMARY KEY (id);


--
-- Name: IDX_admins_mobile_number; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "IDX_admins_mobile_number" ON public.admins USING btree (mobile_number);


--
-- Name: IDX_fields_owner_id; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE INDEX "IDX_fields_owner_id" ON public.fields USING btree (owner_id);


--
-- Name: IDX_fields_owner_id_venue_name_field_name; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "IDX_fields_owner_id_venue_name_field_name" ON public.fields USING btree (owner_id, lower((venue_name)::text), lower((field_name)::text));


--
-- Name: IDX_signup_otp_requests_identifier_account_type; Type: INDEX; Schema: public; Owner: neondb_owner
--

CREATE UNIQUE INDEX "IDX_signup_otp_requests_identifier_account_type" ON public.signup_otp_requests USING btree (identifier, account_type);


--
-- Name: field_rule_books FK_field_rule_books_field_id_fields; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_rule_books
    ADD CONSTRAINT "FK_field_rule_books_field_id_fields" FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE;


--
-- Name: field_schedule_settings FK_field_schedule_settings_field_id_fields; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.field_schedule_settings
    ADD CONSTRAINT "FK_field_schedule_settings_field_id_fields" FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE;


--
-- Name: fields FK_fields_owner_id_admins; Type: FK CONSTRAINT; Schema: public; Owner: neondb_owner
--

ALTER TABLE ONLY public.fields
    ADD CONSTRAINT "FK_fields_owner_id_admins" FOREIGN KEY (owner_id) REFERENCES public.admins(id) ON DELETE CASCADE;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO neon_superuser WITH GRANT OPTION;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: cloud_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE cloud_admin IN SCHEMA public GRANT ALL ON TABLES TO neon_superuser WITH GRANT OPTION;


--
-- PostgreSQL database dump complete
--

\unrestrict HQ4ixD3nOm65Tfog41XLZEDBzXJHeMKdBuh6ZbLKqrd98WGbYYb5DVw5IH3MfBM

