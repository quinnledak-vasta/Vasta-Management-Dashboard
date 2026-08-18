export type TaskStatus = 'pending' | 'in-progress' | 'completed';
export type Priority = 'low' | 'medium' | 'high';
export type UserRole = 'admin' | 'trainer' | 'owner';
export type RecurrenceInterval = 'daily' | 'weekly' | 'monthly' | 'none';

export interface Mail {
  to: string | string[];
  message: {
    subject: string;
    text?: string;
    html?: string;
  };
  delivery?: {
    attempts: number;
    endTime?: string;
    error?: string;
    leaseExpireTime?: string;
    startTime?: string;
    state: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'ERROR';
  };
}

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
  assignedToIds?: string[];
  assignedToNames?: string[];
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

export interface Certification {
  id: string;
  name: string;
  expirationDate: string;
  renewalDate: string;
  isInProgress: boolean;
  expectedCompletionDate?: string;
  expirationAlertSent?: boolean;
  renewalAlertSent?: boolean;
  expectedCompletionAlertSent?: boolean;
}

export interface StaffCheckIn {
  id: string;
  quarter: string;
  checkInDate: string;
  listen360Score: string;
  retentionRate: string;
  referralsCollected: string;
  soapNotes: string;
  programmingNotes: string;
  brainstormingFuture: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface StaffApparelItem {
  id: string;
  name: string;
  quantity: number;
  size?: string;
  notes?: string;
}

export interface StaffAnnualReview {
  id: string;
  year: number;
  reviewDate?: string;
  anniversaryMilestone?: string;
  overallRating?: string;
  accomplishmentsNotes?: string;
  strengthsNotes?: string;
  growthOpportunitiesNotes?: string;
  goalSettingNotes?: string;
  compensationReviewNotes?: string;
  isCompleted?: boolean;
  completedAt?: string;
  completedBy?: string;
  completedByName?: string;
  notes?: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface Trainer {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  location?: Location;
  photoURL?: string;
  certifications?: Certification[];
  checkIns?: StaffCheckIn[];
  annualReviews?: StaffAnnualReview[];
  completedAnnualReviewYears?: number[];
  birthday?: string;
  workAnniversary?: string;
  apparel?: StaffApparelItem[];
  checkInAlertsSent?: string[];
  annualReviewAlertsSent?: string[];
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
  location: Location;
  invitedBy: string;
  invitedByName: string;
  sentAt: string;
  status: 'pending' | 'accepted' | 'expired';
}

export type VacationStatus = 'pending' | 'approved' | 'rejected';
export type Location = 'Dorset Street' | 'Shelburne Road' | 'West Palm Beach';
export type InventoryCategory = 'equipment' | 'retail-equipment' | 'retail-food-drink' | 'retail-apparel' | 'staff-apparel';

export interface VacationRequest {
  id: string;
  userId: string;
  userName: string;
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

export interface Resource {
  id: string;
  title: string;
  url: string;
  category?: string;
  createdAt: string;
  createdBy: string;
}

export interface StaffEvent {
  id: string;
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  type: 'outing' | 'meeting' | 'party' | 'other';
  location?: string;
  createdAt: string;
  createdBy: string;
  createdByName: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  category?: string;
  thumbnailUrl?: string;
  createdAt: string;
  createdBy: string;
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  order: number;
  createdAt: string;
}

export interface Lesson {
  id: string;
  courseId: string;
  chapterId: string;
  title: string;
  description?: string;
  videoUrl?: string;
  textBody?: string;
  duration?: number; // In minutes
  order: number;
  createdAt: string;
  hasHomework?: boolean;
  homeworkTitle?: string;
  homeworkFileUrl?: string; // Base64 dataUrl or web URL
  homeworkFileName?: string;
  homeworkFileType?: 'file' | 'link';
}

export interface UserLessonProgress {
  id: string; // userId_lessonId
  userId: string;
  courseId: string;
  lessonId: string;
  completed: boolean;
  completedAt?: string;
  submittedHomeworkUrl?: string; // Student submission (Base64 dataUrl or Web Link)
  submittedHomeworkFileName?: string; // Original filename if uploaded
  submittedHomeworkType?: 'file' | 'link';
  submittedAt?: string;
  homeworkGrade?: string; // Optional grade/status (e.g. "Pending Review", "Approved", "Revision Needed")
  homeworkFeedback?: string; // Optional trainer/admin feedback
}

