-- name: GetUserByID :one
select *
from users
where id = $1;

-- name: GetUserByName :one
select *
from users
where name = $1;

-- name: CreateUser :one
insert into users (
    name,
    password_hash
) values (
    $1,
    $2
)
returning *;
