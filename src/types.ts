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
  createdByName: string;
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

export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type Location = 'Dorset Street' | 'Shelburne Road' | 'West Palm Beach';
export type InventoryCategory = 'equipment' | 'retail-equipment' | 'retail-food-drink' | 'retail-apparel' | 'staff-apparel';

export interface StaffMember {
  id: string;
  name: string;
  location: Location;
  department?: string;
  startDate?: string;
  status: 'active' | 'inactive';
}

export interface VacationRequest {
  id: string;
  staffId: string;
  staffName: string;
  startDate: string;
  endDate: string;
  status: VacationStatus;
  type: 'vacation' | 'sick' | 'personal' | 'other';
  hours?: number;
  notes?: string;
  createdAt: string;
  totalDays: number;
}

export interface InventoryReportItem {
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface InventoryReport {
  id: string;
  location: Location;
  reportedBy: string;
  reportedByName: string;
  reportedAt: string;
  items: InventoryReportItem[];
  notes?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  location: Location;
  quantity: number;
  price?: number;
  productLink?: string;
  updatedAt: string;
}
