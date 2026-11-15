# Agent instructions

## Follow-ups you cannot finish go into the admin task list

If you work in a cloud or mobile Cursor session and cannot complete part of a request yourself (for example a Supabase dashboard or Auth setting, a missing token or secret, a CLI login, a store/console setting, anything needing a desktop or the user's accounts), do not just mention it in chat. Create a task in the admin panel's **Open tasks** list (`/admin/tasks`, table `public.admin_tasks`):

```sql
insert into public.admin_tasks (category, title, description, prompt)
values ('needs_desktop', '<short title>', '<what is open and why it could not be finished>', '<prompt>');
```

- `category`: `needs_desktop` (solvable by pasting the prompt into Cursor Desktop) or `manual` (steps for a human).
- `prompt`: self-contained, with project refs, exact commands or file paths, what to verify afterwards, and the manual alternative. Someone with no chat context must be able to act on it.
- Insert with the Supabase MCP `execute_sql` on the `cosurfing` project (ref `xijiyqstanafqjmfllsm`). If you cannot reach the database, add a migration that inserts the row instead.
- Mention the new task in your final message.
