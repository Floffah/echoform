create table users
(
    id            serial primary key,
    name          varchar(100) not null unique,
    password_hash varchar(72)  not null,
    onboarded     boolean,
    created_at    timestamp with time zone not null default now(),
    updated_at    timestamp with time zone not null default now()
);

create table user_sessions
(
    id                       serial primary key,
    user_id                  integer                  not null references users (id) on delete cascade,
    access_token             varchar(256)             not null unique,
    refresh_token            varchar(256)             not null unique,
    expires_at               timestamp with time zone not null,
    refresh_token_expires_at timestamp with time zone not null,
    created_at               timestamp with time zone not null default now()
);

create index user_sessions_user_id_idx on user_sessions (user_id);
create index user_sessions_access_token_idx on user_sessions (access_token);

---- create above / drop below ----

drop table user_sessions;
drop table users;
