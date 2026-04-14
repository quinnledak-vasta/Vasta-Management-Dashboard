export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type Priority = 'low' | 'medium' | 'high';
export type UserRole = 'admin' | 'trainer';
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'none';

export interface TaskNote {
  id: string;
  text: string;
  createdAt: string;
  authorName: string;
}

export interface TaskQuestion {
  id: string;
  text: string;
  createdAt: string;
  authorName: string;
  isAnswered: boolean;
  answer?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedToName: string;
  status: TaskStatus;
  priority: Priority;
  dueDate: string;
  createdAt: string;
  createdBy: string;
  isRecurring: boolean;
  recurrenceInterval: RecurrenceInterval;
  notes?: TaskNote[];
  questions?: TaskQuestion[];
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  photoURL?: string;
}

export interface Alert {
  id: string;
  recipientEmail: string;
  subject: string;
  body: string;
  sentAt: string;
  status: 'sent' | 'failed';
}

export interface Invite {
  id: string;
  email: string;
  role: UserRole;
  invitedBy: string;
  invitedByName: string;
  sentAt: string;
  status: 'pending' | 'accepted' | 'expired';
}
