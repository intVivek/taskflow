export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high";

export interface Task {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  owner_email?: string;   // present only in scope=all responses
}

export interface User {
  id: string;
  email: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Attachment {
  id: string;
  task_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface ListMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface TaskList {
  data: Task[];
  meta: ListMeta;
}
