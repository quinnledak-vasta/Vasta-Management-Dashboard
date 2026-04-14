import { Task, Trainer, Alert } from '../types';

export const mockTrainers: Trainer[] = [
  { id: '1', name: 'Alex Johnson', email: 'alex@vasta.com', role: 'admin', photoURL: 'https://picsum.photos/seed/alex/100/100' },
  { id: '2', name: 'Sarah Miller', email: 'sarah@vasta.com', role: 'trainer', photoURL: 'https://picsum.photos/seed/sarah/100/100' },
  { id: '3', name: 'Mike Chen', email: 'mike@vasta.com', role: 'trainer', photoURL: 'https://picsum.photos/seed/mike/100/100' },
  { id: '4', name: 'Emma Wilson', email: 'emma@vasta.com', role: 'trainer', photoURL: 'https://picsum.photos/seed/emma/100/100' },
];

export const mockTasks: Task[] = [
  {
    id: 't1',
    title: 'Update Equipment Inventory',
    description: 'Check all dumbbells and benches for wear and tear. Report any replacements needed.',
    assignedTo: '2',
    assignedToName: 'Sarah Miller',
    status: 'in-progress',
    priority: 'medium',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: '1',
    isRecurring: false,
    recurrenceInterval: 'none',
  },
  {
    id: 't2',
    title: 'Draft New Member Onboarding Email',
    description: 'Create a template for the welcome email sent to new personal training clients.',
    assignedTo: '3',
    assignedToName: 'Mike Chen',
    status: 'pending',
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    createdBy: '1',
    isRecurring: true,
    recurrenceInterval: 'monthly',
  },
  {
    id: 't3',
    title: 'Review Staff Schedule for Q3',
    description: 'Ensure all shifts are covered and holiday requests are accounted for.',
    assignedTo: '1',
    assignedToName: 'Alex Johnson',
    status: 'completed',
    priority: 'low',
    dueDate: new Date(Date.now() - 86400000).toISOString(),
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
    createdBy: '1',
    isRecurring: false,
    recurrenceInterval: 'none',
  },
];

export const mockAlerts: Alert[] = [
  {
    id: 'a1',
    recipientEmail: 'sarah@vasta.com',
    subject: 'Urgent: Equipment Check',
    body: 'Please prioritize the equipment inventory update by tomorrow.',
    sentAt: new Date(Date.now() - 3600000).toISOString(),
    status: 'sent',
  },
];
