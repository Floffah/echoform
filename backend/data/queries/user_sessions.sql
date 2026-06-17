-- name: GetUserSessionByAccessToken :one
select *
from user_sessions
where access_token = $1;

-- name: ListUserSessionsByUserID :many
select *
from user_sessions
where user_id = $1
order by created_at desc;

-- name: DeleteUserSessionsByUserID :exec
delete from user_sessions
where user_id = $1;

-- name: CreateUserSession :one
insert into user_sessions (
    user_id,
    access_token,
    refresh_token,
    expires_at,
    refresh_token_expires_at
) values (
    $1,
    $2,
    $3,
    $4,
    $5
)
returning *;
