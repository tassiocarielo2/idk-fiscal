@echo off
rem ============================================================
rem Wrapper que carrega .env.local e inicia o Supabase MCP server.
rem Permite que SUPABASE_ACCESS_TOKEN viva apenas em .env.local.
rem ============================================================

setlocal enabledelayedexpansion

set "ENV_FILE=%~dp0..\.env.local"

if not exist "%ENV_FILE%" (
  echo [mcp-supabase] .env.local nao encontrado em %ENV_FILE% 1>&2
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  set "key=%%A"
  set "val=%%B"
  if defined key (
    set "first=!key:~0,1!"
    if not "!first!"=="#" (
      if defined val set "!key!=!val!"
    )
  )
)

if not defined SUPABASE_ACCESS_TOKEN (
  echo [mcp-supabase] SUPABASE_ACCESS_TOKEN ausente em .env.local 1>&2
  exit /b 1
)

npx -y @supabase/mcp-server-supabase@latest --project-ref=vejpzbqsysxbfpqpkbto %*
