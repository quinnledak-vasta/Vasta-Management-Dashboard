/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Users, 
  Plus, 
  Minus,
  Search, 
  Filter, 
  MoreVertical, 
  Clock, 
  Calendar,
  CalendarDays,
  Umbrella,
  AlertCircle, 
  CheckCircle2,
  Mail,
  Send,
  Sparkles,
  ChevronRight,
  ClipboardCheck,
  LogOut,
  UserPlus,
  Repeat,
  Trash2,
  Edit2,
  Package,
  ShoppingCart,
  Link,
  Tag,
  Shirt,
  Coffee,
  Dumbbell,
  ExternalLink,
  MapPin,
  FileText,
  Award,
  ClipboardList,
  History,
  Cake,
  Briefcase,
  Megaphone,
  GraduationCap,
  BookOpen,
  Play,
  Video,
  ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, getDay, isWithinInterval, parseISO } from 'date-fns';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuGroup,
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '../components/ui/dropdown-menu';
import { Toaster } from '../components/ui/sonner';
import { toast } from 'sonner';
import { Checkbox } from '../components/ui/checkbox';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginPage } from './components/LoginPage';
import { TrainerCheckInPanel } from './components/TrainerCheckInPanel';
import { db, auth } from './lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  query, 
  orderBy, 
  Timestamp,
  setDoc,
  getDocFromServer,
  getDoc,
  arrayUnion,
  where,
  or,
  writeBatch
} from 'firebase/firestore';
import { 
  Task, 
  Trainer, 
  Alert, 
  TaskStatus, 
  Priority, 
  Invite, 
  UserRole, 
  RecurrenceInterval, 
  TaskNote, 
  TaskQuestion,
  VacationRequest,
  VacationStatus,
  Location,
  InventoryItem,
  InventoryCategory,
  InventoryReport,
  InventoryReportItem,
  Resource,
  Certification,
  StaffCheckIn,
  StaffApparelItem,
  StaffEvent,
  Course,
  Chapter,
  Lesson,
  UserLessonProgress
} from './types';
import { GoogleGenAI } from "@google/genai";

// Initialize Gemini for drafting alerts
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email || undefined,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster position="top-right" />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading, logout, addInvite } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';
  const canManageCheckIns = (currentUser: any, targetTrainerId: string) => {
    if (!currentUser) return false;
    const nameLower = currentUser.name?.toLowerCase().trim();
    const isSpecialCheckInStaff = nameLower === 'cole george' || nameLower === 'connor lee';
    const isUserAdmin = currentUser.role === 'admin' || currentUser.role === 'owner';
    return isUserAdmin || isSpecialCheckInStaff || currentUser.id === targetTrainerId;
  };
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const staffApparelNames = Array.from(
    new Set(
      inventoryItems
        .filter(item => item.category === 'staff-apparel')
        .map(item => item.name.trim())
    )
  ).sort();
  const [inventoryReports, setInventoryReports] = useState<InventoryReport[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [staffEvents, setStaffEvents] = useState<StaffEvent[]>([]);
  const [resourcesSubTab, setResourcesSubTab] = useState<'links' | 'calendar'>('links');
  const [isNewEventOpen, setIsNewEventOpen] = useState(false);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    type: 'outing' as 'outing' | 'meeting' | 'party' | 'other',
    location: '',
  });
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState<Date>(() => new Date());

  // Onboarding/Education Course States
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progressList, setProgressList] = useState<UserLessonProgress[]>([]);
  
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [isOnboardingAdminMode, setIsOnboardingAdminMode] = useState(false);
  
  const [isNewCourseOpen, setIsNewCourseOpen] = useState(false);
  const [isNewChapterOpen, setIsNewChapterOpen] = useState(false);
  const [isNewLessonOpen, setIsNewLessonOpen] = useState(false);
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);

  const [newCourse, setNewCourse] = useState({
    title: '',
    description: '',
    category: 'Onboarding',
    thumbnailUrl: '',
  });
  const [newChapter, setNewChapter] = useState({
    courseId: '',
    title: '',
    order: 1,
  });
  const [newLesson, setNewLesson] = useState({
    courseId: '',
    chapterId: '',
    title: '',
    description: '',
    videoUrl: '',
    textBody: '',
    duration: 5,
    order: 1,
  });
  
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      const validTabs = ['tasks', 'team', 'staff', 'vacations', 'inventory', 'resources', 'marketing', 'onboarding'];
      if (tabParam && validTabs.includes(tabParam)) return tabParam;
      if (window.location.hash) {
        const hashTab = window.location.hash.replace('#', '');
        if (validTabs.includes(hashTab)) return hashTab;
      }
    } catch (e) {
      console.error(e);
    }
    return 'tasks';
  });
  const [certSearchQuery, setCertSearchQuery] = useState('');
  const [expandedTrainerId, setExpandedTrainerId] = useState<string | null>(null);
  const [expandedCheckInTrainerId, setExpandedCheckInTrainerId] = useState<string | null>(null);
  const [newCertName, setNewCertName] = useState('');
  const [newCertExpiration, setNewCertExpiration] = useState('');
  const [newCertRenewal, setNewCertRenewal] = useState('');
  const [newCertInProgress, setNewCertInProgress] = useState(false);
  const [newCertExpectedCompletion, setNewCertExpectedCompletion] = useState('');
  const [editBirthday, setEditBirthday] = useState('');
  const [editWorkAnniversary, setEditWorkAnniversary] = useState('');
  const [newApparelName, setNewApparelName] = useState('');
  const [newApparelQty, setNewApparelQty] = useState('1');
  const [newApparelSize, setNewApparelSize] = useState('M');
  const [newApparelNotes, setNewApparelNotes] = useState('');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isNewVacationOpen, setIsNewVacationOpen] = useState(false);
  const [isNewInventoryOpen, setIsNewInventoryOpen] = useState(false);
  const [isInventoryReportOpen, setIsInventoryReportOpen] = useState(false);
  const [isNewResourceOpen, setIsNewResourceOpen] = useState(false);
  
  const [selectedReportLocation, setSelectedReportLocation] = useState<Location | ''>('');
  const [reportItemCounts, setReportItemCounts] = useState<Record<string, number>>({});
  const [auditedItemIds, setAuditedItemIds] = useState<Record<string, boolean>>({});
  const [reportNotes, setReportNotes] = useState('');
  
  const [isRestockRequestOpen, setIsRestockRequestOpen] = useState(false);
  const [selectedRestockLocation, setSelectedRestockLocation] = useState<Location | ''>('');
  const [restockItemIds, setRestockItemIds] = useState<Record<string, boolean>>({});
  const [restockItemQuantities, setRestockItemQuantities] = useState<Record<string, number>>({});
  const [restockNotes, setRestockNotes] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');

  const [newVacation, setNewVacation] = useState({
    userId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'vacation' as const,
    hours: 8,
    notes: ''
  });
  const [editingVacationId, setEditingVacationId] = useState<string | null>(null);

  const [newInventoryItem, setNewInventoryItem] = useState({
    name: '',
    category: 'equipment' as InventoryCategory,
    location: 'Dorset Street' as Location,
    quantity: 0,
    price: 0,
    productLink: ''
  });
  const [inventoryLocationFilter, setInventoryLocationFilter] = useState<Location | 'All'>('All');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedToIds: [] as string[],
    priority: 'medium' as Priority,
    dueDate: new Date().toISOString().split('T')[0],
  });

  const [newInvite, setNewInvite] = useState<Partial<Invite>>({
    email: '',
    role: 'trainer',
    location: 'Dorset Street' as Location
  });

  const [newResource, setNewResource] = useState({
    title: '',
    url: '',
    category: ''
  });

  // Fetch Tasks from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'tasks';
    
    let q;
    if (isAdmin) {
      q = query(collection(db, path), orderBy('createdAt', 'desc'));
    } else {
      q = query(
        collection(db, path), 
        or(
          where('assignedTo', '==', user.id), 
          where('assignedToIds', 'array-contains', user.id),
          where('createdBy', '==', user.id)
        ),
        orderBy('createdAt', 'desc')
      );
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const taskList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Task[];
      setTasks(taskList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Fetch Trainers from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'users';
    const q = query(collection(db, path), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trainerList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Trainer[];
      setTrainers(trainerList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Handle direct url actions (Approve / Reject Vacation from email)
  useEffect(() => {
    if (!user || !isAdmin) return;
    
    const processQueryActions = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const action = params.get('action');
        const vacationId = params.get('vacationId');
        
        if (action && vacationId && (action === 'approve' || action === 'reject')) {
          const targetStatus = action === 'approve' ? 'approved' : 'rejected';
          
          // Show non-blocking toast warning that we are updating
          const toastId = toast.loading(`Processing vacation request ${targetStatus}...`);
          
          const vacationRef = doc(db, 'vacations', vacationId);
          const vacationDoc = await getDoc(vacationRef);
          
          if (!vacationDoc.exists()) {
            toast.error("Vacation request not found or has been deleted.", { id: toastId });
            return;
          }
          
          const vData = vacationDoc.data() as VacationRequest;
          if (vData.status === targetStatus) {
            toast.info(`Request was already ${targetStatus}.`, { id: toastId });
          } else {
            // Perform Firestore update
            await updateDoc(vacationRef, { status: targetStatus });
            toast.success(`Vacation request successfully ${targetStatus}!`, { id: toastId });
            
            // Queue an email notification back to the staff member who requested
            if (vData.userId) {
              const userRef = doc(db, 'users', vData.userId);
              const userDocSnapshot = await getDoc(userRef);
              if (userDocSnapshot.exists()) {
                const trainerData = userDocSnapshot.data() as Trainer;
                if (trainerData.email) {
                  try {
                    await addDoc(collection(db, 'mail'), {
                      to: trainerData.email,
                      message: {
                        subject: `Vacation Request ${targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1)}`,
                        html: `
                          <div style="font-family: sans-serif; padding: 25px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                            <div style="text-align: center; margin-bottom: 20px;">
                              <span style="font-weight: bold; font-size: 20px; color: #ef4444; letter-spacing: -0.5px;">Vasta Personal Training</span>
                            </div>
                            <h2 style="color: ${targetStatus === 'approved' ? '#16a34a' : '#dc2626'}; font-size: 18px; margin-top: 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; font-weight: 700;">
                              Vacation Request ${targetStatus.charAt(0).toUpperCase() + targetStatus.slice(1)}
                            </h2>
                            <p style="font-size: 14px; line-height: 1.5; color: #334155;">Hi <strong>${trainerData.name}</strong>,</p>
                            <p style="font-size: 14px; line-height: 1.5; color: #334155;">
                              Your vacation request for <strong>${new Date(vData.startDate).toLocaleDateString()} to ${new Date(vData.endDate).toLocaleDateString()}</strong> has been <strong>${targetStatus}</strong> by an administrator.
                            </p>
                            <p style="font-size: 14px; line-height: 1.5; color: #334155;">Please log in to the dashboard for more details.</p>
                            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
                            <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                          </div>
                        `
                      }
                    });
                  } catch (mailErr) {
                    console.error("Failed to enqueue status update mail:", mailErr);
                  }
                }
              }
            }
          }
          
          // Clean parameters from the URL so it doesn't process again
          const newUrl = window.location.pathname + '?tab=vacations';
          window.history.replaceState({}, '', newUrl);
        }
      } catch (err) {
        console.error("Error executing direct vacation URL action:", err);
        toast.error("Failed to execute request action. Please try manually.");
      }
    };
    
    processQueryActions();
  }, [user, isAdmin]);

  // Fetch Alerts from Firestore - REMOVED (Keeping communication app-based)
  /*
  useEffect(() => {
    if (!user || user.role !== 'admin') return;
    const path = 'alerts';
    const q = query(collection(db, path), orderBy('sentAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const alertList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Alert[];
      setAlerts(alertList.length > 0 ? alertList : mockAlerts);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);
  */

  // Fetch Invites from Firestore
  useEffect(() => {
    if (!user || !isAdmin) return;
    const path = 'invites';
    const q = query(collection(db, path), orderBy('sentAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inviteList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Invite[];
      setInvites(inviteList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Check and send alerts for certifications approaching their target dates (1 month prior)
  useEffect(() => {
    if (!user || trainers.length === 0) return;

    const checkCerts = async () => {
      const today = new Date();
      // Calculate active timeframe: warning starts 30 days / 1 month prior
      const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

      // Decide which trainers we are allowed to check based on permissions
      const trainersToCheck = isAdmin 
        ? trainers 
        : trainers.filter(t => t.id === user.id);

      for (const trainer of trainersToCheck) {
        if (!trainer.certifications || trainer.certifications.length === 0) continue;

        let docUpdated = false;
        const updatedCerts = [...trainer.certifications];

        for (let i = 0; i < updatedCerts.length; i++) {
          const cert = updatedCerts[i];
          
          let shouldTriggerExpiration = false;
          let shouldTriggerRenewal = false;
          let shouldTriggerExpected = false;

          // 1. Expiration dates check
          if (cert.expirationDate && !cert.isInProgress && !cert.expirationAlertSent) {
            try {
              const expDate = new Date(cert.expirationDate);
              const diffTime = expDate.getTime() - today.getTime();
              // Trigger if expiration is approaching within about 1 month
              if (diffTime <= oneMonthMs) {
                shouldTriggerExpiration = true;
              }
            } catch (e) {
              console.error(e);
            }
          }

          // 2. Renewal dates check
          if (cert.renewalDate && !cert.isInProgress && !cert.renewalAlertSent) {
            try {
              const renewDate = new Date(cert.renewalDate);
              const diffTime = renewDate.getTime() - today.getTime();
              if (diffTime <= oneMonthMs) {
                shouldTriggerRenewal = true;
              }
            } catch (e) {
              console.error(e);
            }
          }

          // 3. Expected completion dates check
          if (cert.expectedCompletionDate && cert.isInProgress && !cert.expectedCompletionAlertSent) {
            try {
              const expCompDate = new Date(cert.expectedCompletionDate);
              const diffTime = expCompDate.getTime() - today.getTime();
              if (diffTime <= oneMonthMs) {
                shouldTriggerExpected = true;
              }
            } catch (e) {
              console.error(e);
            }
          }

          if (shouldTriggerExpiration || shouldTriggerRenewal || shouldTriggerExpected) {
            // Find recipients: location manager (admin of same location) + owner
            const recipients = trainers.filter(t => 
              (t.role === 'admin' && t.location === trainer.location) || 
              t.role === 'owner'
            );

            let dateLabel = '';
            let dateValue = '';

            if (shouldTriggerExpiration) {
              dateLabel = 'Expiration Date';
              dateValue = cert.expirationDate;
              updatedCerts[i] = { ...cert, expirationAlertSent: true };
            } else if (shouldTriggerRenewal) {
              dateLabel = 'Renewal Date';
              dateValue = cert.renewalDate;
              updatedCerts[i] = { ...cert, renewalAlertSent: true };
            } else if (shouldTriggerExpected) {
              dateLabel = 'Expected Completion Date';
              dateValue = cert.expectedCompletionDate || '';
              updatedCerts[i] = { ...cert, expectedCompletionAlertSent: true };
            }

            docUpdated = true;

            // Send actual email via Firestore 'mail' collection to each recipient
            for (const recipient of recipients) {
              if (recipient.email) {
                try {
                  await addDoc(collection(db, 'mail'), {
                    to: recipient.email,
                    message: {
                      subject: `⚠️ Certification Warning: ${trainer.name} - ${cert.name}`,
                      html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                          <div style="background-color: #ef4444; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
                            <h2 style="margin: 0; font-size: 20px; font-weight: bold;">
                              ⚠️ Certification Coming Up
                            </h2>
                          </div>
                          
                          <p>Hi <strong>${recipient.name}</strong>,</p>
                          <p>This is an automated alert notify you that a certification for <strong>${trainer.name}</strong> is approaching its key date in approximately one month or has already reached it.</p>
                          
                          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Staff Member:</strong> ${trainer.name}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${trainer.location || 'N/A'}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Certification:</strong> ${cert.name}</p>
                            <p style="margin: 0 0 10px 0; color: #b91c1c;"><strong>Approaching event:</strong> ${dateLabel}</p>
                            <p style="margin: 0; font-size: 16px; font-weight: bold; color: #b91c1c;"><strong>Target Date:</strong> ${dateValue}</p>
                          </div>
                          
                          <p>Please connect with ${trainer.name} to ensure training files are maintained and certificates are renewed on schedule.</p>
                          
                          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                        </div>
                      `
                    }
                  });
                } catch (e) {
                  console.error("Failed to write alert email document", e);
                }
              }
            }
          }
        }

        if (docUpdated) {
          try {
            await updateDoc(doc(db, 'users', trainer.id), {
              certifications: updatedCerts
            });
          } catch (e) {
            console.error("Failed to update certifications alert flags in Firestore", e);
          }
        }
      }
    };

    checkCerts();
  }, [user, trainers, isAdmin]);

  // Check and send alerts for quarterly check-ins due at the end of a quarter or overdue
  useEffect(() => {
    if (!user || trainers.length === 0) return;

    const checkQuarterlyReviews = async () => {
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      const currentYear = today.getFullYear();
      
      // Calculate current quarter
      const quarterNum = Math.floor(currentMonth / 3) + 1;
      const currentQuarterStr = `Q${quarterNum} ${currentYear}`;
      
      // Check if it is the end of the quarter (last month of the quarter: March, June, September, December)
      const isEndOfQuarter = (currentMonth % 3) === 2;

      // Calculate previous quarter
      let prevQuarterNum = quarterNum - 1;
      let prevQuarterYear = currentYear;
      if (quarterNum === 1) {
        prevQuarterNum = 4;
        prevQuarterYear = currentYear - 1;
      }
      const prevQuarterStr = `Q${prevQuarterNum} ${prevQuarterYear}`;

      // Helper to convert quarter string (e.g., "Q2 2026") to comparable numeric weight
      const getQuarterWeight = (qStr: string): number => {
        const match = qStr.match(/^Q([1-4])\s+(\d{4})$/);
        if (!match) return 0;
        const q = parseInt(match[1], 10);
        const y = parseInt(match[2], 10);
        return y * 10 + q;
      };

      const presentQuarterWeight = getQuarterWeight("Q2 2026"); // Present quarter weight as of June 2026 implementation

      for (const trainer of trainers) {
        // Only run alerts for trainers (coaches), ignore administrators / owners themselves
        if (trainer.role !== 'trainer') continue;

        let alertsUpdated = false;
        const currentAlertsSent = trainer.checkInAlertsSent || [];
        const updatedAlertsSent = [...currentAlertsSent];

        // 1. End of current quarter alert
        if (isEndOfQuarter) {
          const alertKey = `${currentQuarterStr}-end`;
          const hasLoggedCheckIn = trainer.checkIns?.some(ci => ci.quarter === currentQuarterStr);
          const alreadySent = currentAlertsSent.includes(alertKey);

          if (!hasLoggedCheckIn && !alreadySent) {
            // Find recipients: location manager (admin of same location)
            const recipients = trainers.filter(t => 
              t.role === 'admin' && trainer.location && t.location === trainer.location
            );

            for (const recipient of recipients) {
              if (recipient.email) {
                try {
                  await addDoc(collection(db, 'mail'), {
                    to: recipient.email,
                    message: {
                      subject: `⏰ Action Required: Quarterly Check-In Due for ${trainer.name} - ${currentQuarterStr}`,
                      html: `
                        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                          <div style="background-color: #f59e0b; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
                            <h2 style="margin: 0; font-size: 20px; font-weight: bold;">
                              ⏰ Quarterly Check-In Due Soon
                            </h2>
                          </div>
                          
                          <p>Hi <strong>${recipient.name}</strong>,</p>
                          <p>This is an automated reminder that the current quarter is ending, and a quarterly check-in for coach <strong>${trainer.name}</strong> has not yet been recorded.</p>
                          
                          <div style="background-color: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fef3c7; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0;"><strong>Coach Name:</strong> ${trainer.name}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${trainer.location || 'N/A'}</p>
                            <p style="margin: 0 0 10px 0;"><strong>Due Quarter:</strong> ${currentQuarterStr}</p>
                            <p style="margin: 0; font-size: 14px; font-weight: bold; color: #d97706;">Status: Missing / Pending</p>
                          </div>
                          
                          <p>Please log in to the Vasta Personal Training Dashboard to conduct the check-in and record the Soap/Programming notes, or coordinate with ${trainer.name}.</p>
                          
                          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                          <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                        </div>
                      `
                    }
                  });
                } catch (e) {
                  console.error("Failed to write check-in due alert email document", e);
                }
              }
            }

            updatedAlertsSent.push(alertKey);
            alertsUpdated = true;
          }
        }

        // 2. Overdue previous quarter alert (quarter ended and review not recorded)
        const overdueAlertKey = `${prevQuarterStr}-overdue`;
        const hasLoggedPrevCheckIn = trainer.checkIns?.some(ci => ci.quarter === prevQuarterStr);
        const alreadySentOverdue = currentAlertsSent.includes(overdueAlertKey);

        // Ensure we do not send alerts for past quarters prior to Q2 2026.
        const isPrevQuarterBeforePresent = getQuarterWeight(prevQuarterStr) < presentQuarterWeight;

        if (!hasLoggedPrevCheckIn && !alreadySentOverdue && !isPrevQuarterBeforePresent) {
          // Find recipients: location manager (admin of same location)
          const recipients = trainers.filter(t => 
            t.role === 'admin' && trainer.location && t.location === trainer.location
          );

          for (const recipient of recipients) {
            if (recipient.email) {
              try {
                await addDoc(collection(db, 'mail'), {
                  to: recipient.email,
                  message: {
                    subject: `⚠️ Overdue Check-In: ${trainer.name} - ${prevQuarterStr} Review Pending`,
                    html: `
                      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                        <div style="background-color: #ef4444; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
                          <h2 style="margin: 0; font-size: 20px; font-weight: bold;">
                            ⚠️ Overdue Check-In Alert
                          </h2>
                        </div>
                        
                        <p>Hi <strong>${recipient.name}</strong>,</p>
                        <p>The previous quarter has ended, but a quarterly check-in has not been recorded for coach <strong>${trainer.name}</strong>.</p>
                        
                        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; border: 1px solid #fee2e2; margin: 20px 0;">
                          <p style="margin: 0 0 10px 0;"><strong>Coach Name:</strong> ${trainer.name}</p>
                          <p style="margin: 0 0 10px 0;"><strong>Location:</strong> ${trainer.location || 'N/A'}</p>
                          <p style="margin: 0 0 10px 0;"><strong>Missed Quarter:</strong> ${prevQuarterStr}</p>
                          <p style="margin: 0; font-size: 14px; font-weight: bold; color: #dc2626;">Status: OVERDUE</p>
                        </div>
                        
                        <p>This check-in is now past due. Please prioritize conducting this check-in to ensure staff development files remain up to date.</p>
                        
                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                        <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                      </div>
                    `
                  }
                });
              } catch (e) {
                console.error("Failed to write overdue alert email document", e);
              }
            }
          }

          updatedAlertsSent.push(overdueAlertKey);
          alertsUpdated = true;
        }

        if (alertsUpdated) {
          try {
            await updateDoc(doc(db, 'users', trainer.id), {
              checkInAlertsSent: updatedAlertsSent
            });
          } catch (e) {
            console.error("Failed to update check-in alert flags in Firestore", e);
          }
        }
      }
    };

    checkQuarterlyReviews();
  }, [user, trainers]);

  // Fetch Resources from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'resources';
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const resourceList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Resource[];
      setResources(resourceList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Staff Events from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'staff_events';
    const q = query(collection(db, path), orderBy('date', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const eventList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffEvent[];
      setStaffEvents(eventList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Onboarding Courses from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'courses';
    const q = query(collection(db, path), orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const courseList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Course[];
      setCourses(courseList);
      if (courseList.length === 1 && !activeCourseId) {
        setActiveCourseId(courseList[0].id);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Onboarding Chapters from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'chapters';
    const q = query(collection(db, path), orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chapterList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Chapter[];
      setChapters(chapterList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Onboarding Lessons from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'lessons';
    const q = query(collection(db, path), orderBy('order', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const lessonList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Lesson[];
      setLessons(lessonList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Onboarding User Progress from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'course_progress';
    const q = query(collection(db, path), where('userId', '==', user.id));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const progressList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserLessonProgress[];
      setProgressList(progressList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Set active lesson automatically
  useEffect(() => {
    if (activeCourseId && (!activeLessonId || !lessons.some(l => l.id === activeLessonId && l.courseId === activeCourseId))) {
      const courseChapters = chapters.filter(c => c.courseId === activeCourseId).sort((a,b) => a.order - b.order);
      if (courseChapters.length > 0) {
        for (const chap of courseChapters) {
          const chapLessons = lessons.filter(l => l.chapterId === chap.id).sort((a,b) => a.order - b.order);
          if (chapLessons.length > 0) {
            setActiveLessonId(chapLessons[0].id);
            break;
          }
        }
      }
    }
  }, [activeCourseId, activeLessonId, chapters, lessons]);

  // Fetch Vacations from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'vacations';
    
    let q;
    if (isAdmin) {
      q = query(collection(db, path), orderBy('startDate', 'desc'));
    } else {
      q = query(collection(db, path), where('userId', '==', user.id), orderBy('startDate', 'desc'));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const vacationList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as VacationRequest[];
      setVacations(vacationList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  // Fetch Inventory from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'inventory';
    const q = query(collection(db, path), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inventoryList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryItem[];
      setInventoryItems(inventoryList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Inventory Reports from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'inventoryReports';
    const q = query(collection(db, path), orderBy('reportedAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryReport[];
      setInventoryReports(reports);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);


  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.assignedToName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tasks, searchQuery]);

  const handleCreateTask = async () => {
    if (!newTask.title || newTask.assignedToIds.length === 0) {
      toast.error("Please provide a title and select at least one trainer");
      return;
    }

    const assignedTrainers = trainers.filter(t => newTask.assignedToIds.includes(t.id));
    const firstTrainer = assignedTrainers[0];
    
    const taskData: Omit<Task, 'id'> = {
      title: newTask.title,
      description: newTask.description,
      assignedTo: firstTrainer?.id || '',
      assignedToName: assignedTrainers.map(t => t.name).join(', ') || 'Unknown',
      assignedToIds: newTask.assignedToIds,
      assignedToNames: assignedTrainers.map(t => t.name),
      status: 'pending',
      priority: newTask.priority,
      dueDate: new Date(newTask.dueDate).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: user?.id || 'unknown',
      createdByName: user?.name || user?.email || 'Unknown',
      isRecurring: false,
      recurrenceInterval: 'none',
      notes: [],
      questions: [],
    };

    try {
      const taskRef = await addDoc(collection(db, 'tasks'), taskData);
      
      // Send email notifications to each trainer if email is available
      for (const trainer of assignedTrainers) {
        if (trainer.email) {
          try {
            await addDoc(collection(db, 'mail'), {
              to: trainer.email,
              message: {
                subject: `New Task Assigned: ${taskData.title}`,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: #ef4444;">New Task Assigned</h2>
                    <p>Hi <strong>${trainer.name}</strong>,</p>
                    <p>A new administrative task has been assigned to you (and other team members: ${taskData.assignedToName}) by <strong>${taskData.createdByName}</strong>.</p>
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                      <h3 style="margin-top: 0;">${taskData.title}</h3>
                      <p>${taskData.description || 'No description provided.'}</p>
                      <p><strong>Priority:</strong> ${taskData.priority.charAt(0).toUpperCase() + taskData.priority.slice(1)}</p>
                      <p><strong>Due Date:</strong> ${new Date(taskData.dueDate).toLocaleDateString()}</p>
                    </div>
                    <p>Please log in to the dashboard to view more details.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                  </div>
                `
              }
            });
          } catch (emailError) {
            console.error(`Failed to queue notification email for ${trainer.email}:`, emailError);
          }
        }
      }

      setIsNewTaskOpen(false);
      setNewTask({
        title: '',
        description: '',
        assignedToIds: [] as string[],
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
      });
      toast.success("Task assigned successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'tasks');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
      toast.success(`Task marked as ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
      toast.success("Task deleted successfully");
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${taskId}`);
    }
  };

  const handleSendInvite = async () => {
    if (!user || !isAdmin || !newInvite.email || !newInvite.location) {
      toast.error("Role permissions, email, and location required");
      return;
    }
    
    const email = newInvite.email.toLowerCase().trim();

    try {
      await addInvite(email, newInvite.role || 'trainer', newInvite.location);
      setNewInvite({ email: '', role: 'trainer', location: 'Dorset Street' });
      setIsInviteOpen(false);
    } catch (error) {
      // Error handled in AuthContext
    }
  };

  const handleUpdateTrainerInfo = async (trainerId: string, role: UserRole, location: Location) => {
    if (!user || !isAdmin) return;
    try {
      await updateDoc(doc(db, 'users', trainerId), { role, location });
      toast.success("Trainer info updated");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleAddCertification = async (trainerId: string, certName: string, expirationDate: string, renewalDate: string, isInProgress: boolean, expectedCompletionDate: string) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage certifications for this trainer");
      return;
    }

    if (!certName.trim()) {
      toast.error("Certification name is required");
      return;
    }

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentCerts = trainer.certifications || [];
      const newCert: Certification = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        name: certName.trim(),
        expirationDate: isInProgress ? '' : expirationDate,
        renewalDate: isInProgress ? '' : renewalDate,
        isInProgress,
        expectedCompletionDate: isInProgress ? expectedCompletionDate : ''
      };

      const updatedCerts = [...currentCerts, newCert];
      await updateDoc(doc(db, 'users', trainerId), {
        certifications: updatedCerts
      });
      toast.success("Certification added successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleRemoveCertification = async (trainerId: string, certId: string) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage certifications for this trainer");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this certification?")) return;

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentCerts = trainer.certifications || [];
      const updatedCerts = currentCerts.filter(c => c.id !== certId);

      await updateDoc(doc(db, 'users', trainerId), {
        certifications: updatedCerts
      });
      toast.success("Certification removed");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleUpdateTrainerDates = async (trainerId: string, birthday: string, workAnniversary: string) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage info for this trainer");
      return;
    }

    try {
      await updateDoc(doc(db, 'users', trainerId), {
        birthday: birthday || '',
        workAnniversary: workAnniversary || ''
      });
      toast.success("Staff profile details updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleAddApparel = async (trainerId: string, apparelName: string, quantity: number, size?: string, notes?: string) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage apparel for this trainer");
      return;
    }

    if (!apparelName.trim()) {
      toast.error("Apparel description/name is required");
      return;
    }

    if (quantity <= 0) {
      toast.error("Quantity must be positive");
      return;
    }

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentApparel = trainer.apparel || [];
      const newApparelItem: StaffApparelItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        name: apparelName.trim(),
        quantity,
        size: size?.trim() || 'M',
        notes: notes?.trim() || ''
      };

      const updatedApparel = [...currentApparel, newApparelItem];
      await updateDoc(doc(db, 'users', trainerId), {
        apparel: updatedApparel
      });
      toast.success("Apparel item added successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleRemoveApparel = async (trainerId: string, apparelId: string) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage apparel for this trainer");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this apparel record?")) return;

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentApparel = trainer.apparel || [];
      const updatedApparel = currentApparel.filter(a => a.id !== apparelId);

      await updateDoc(doc(db, 'users', trainerId), {
        apparel: updatedApparel
      });
      toast.success("Apparel item removed");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleUpdateApparelQty = async (trainerId: string, apparelId: string, delta: number) => {
    if (!user) return;
    const canEdit = isAdmin || user.id === trainerId;
    if (!canEdit) {
      toast.error("You do not have permission to manage apparel for this trainer");
      return;
    }

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentApparel = trainer.apparel || [];
      const updatedApparel = currentApparel.map(item => {
        if (item.id === apparelId) {
          const newQty = Math.max(1, item.quantity + delta);
          return { ...item, quantity: newQty };
        }
        return item;
      });

      await updateDoc(doc(db, 'users', trainerId), {
        apparel: updatedApparel
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleAddCheckIn = async (
    trainerId: string,
    quarter: string,
    date: string,
    listen360Score: string,
    retentionRate: string,
    referralsCollected: string,
    soapNotes: string,
    programmingNotes: string,
    brainstormingFuture: string
  ) => {
    if (!user) return;
    const canEdit = canManageCheckIns(user, trainerId);
    if (!canEdit) {
      toast.error("You do not have permission to manage check-ins for this trainer");
      return;
    }

    if (!quarter.trim()) {
      toast.error("Quarter selection is required");
      return;
    }

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentCheckIns = trainer.checkIns || [];
      const newCheckIn: StaffCheckIn = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
        quarter: quarter,
        checkInDate: date,
        listen360Score: listen360Score.trim(),
        retentionRate: retentionRate.trim(),
        referralsCollected: referralsCollected.trim(),
        soapNotes: soapNotes.trim(),
        programmingNotes: programmingNotes.trim(),
        brainstormingFuture: brainstormingFuture.trim(),
        createdAt: new Date().toISOString(),
        createdBy: user.id,
        createdByName: user.name || 'Unknown'
      };

      const updatedCheckIns = [...currentCheckIns, newCheckIn];
      await updateDoc(doc(db, 'users', trainerId), {
        checkIns: updatedCheckIns
      });
      toast.success("Quarterly check-in submitted successfully!");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleRemoveCheckIn = async (trainerId: string, checkInId: string) => {
    if (!user) return;
    const canEdit = canManageCheckIns(user, trainerId);
    if (!canEdit) {
      toast.error("You do not have permission to delete check-ins for this trainer");
      return;
    }

    if (!window.confirm("Are you sure you want to delete this quarterly check-in?")) {
      return;
    }

    try {
      const trainer = trainers.find(t => t.id === trainerId);
      if (!trainer) return;

      const currentCheckIns = trainer.checkIns || [];
      const updatedCheckIns = currentCheckIns.filter(ci => ci.id !== checkInId);

      await updateDoc(doc(db, 'users', trainerId), {
        checkIns: updatedCheckIns
      });
      toast.success("Quarterly check-in deleted");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${trainerId}`);
    }
  };

  const handleRemoveMember = async (trainerId: string) => {
    if (!user || !isAdmin) return;
    if (trainerId === user.id) {
      toast.error("You cannot remove yourself");
      return;
    }

    if (!window.confirm("Are you sure you want to remove this member? All their assigned tasks will remain but will no longer be linked to an active user.")) return;

    try {
      await deleteDoc(doc(db, 'users', trainerId));
      toast.success("Member removed successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${trainerId}`);
    }
  };

  const handleRemoveInvite = async (inviteId: string) => {
    if (!user || !isAdmin) return;

    if (!window.confirm("Are you sure you want to cancel this invitation?")) return;

    try {
      await deleteDoc(doc(db, 'invites', inviteId));
      toast.success("Invitation cancelled successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invites/${inviteId}`);
    }
  };

  const handleCreateResource = async () => {
    if (!user || !isAdmin) return;
    if (!newResource.title || !newResource.url) {
      toast.error("Please provide both a title and a URL");
      return;
    }

    try {
      const resourceData: Omit<Resource, 'id'> = {
        title: newResource.title,
        url: newResource.url.startsWith('http') ? newResource.url : `https://${newResource.url}`,
        category: newResource.category || 'General',
        createdAt: new Date().toISOString(),
        createdBy: user.id
      };
      await addDoc(collection(db, 'resources'), resourceData);
      setNewResource({ title: '', url: '', category: '' });
      setIsNewResourceOpen(false);
      toast.success("Resource added successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'resources');
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this resource?")) return;

    try {
      await deleteDoc(doc(db, 'resources', resourceId));
      toast.success("Resource deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `resources/${resourceId}`);
    }
  };

  const handleCreateStaffEvent = async () => {
    if (!user) return;
    if (!newEvent.title || !newEvent.date) {
      toast.error("Please provide both a title and a date");
      return;
    }

    try {
      const eventData = {
        title: newEvent.title,
        description: newEvent.description || '',
        date: newEvent.date,
        type: newEvent.type,
        location: newEvent.location || '',
        createdAt: new Date().toISOString(),
        createdBy: user.id,
        createdByName: user.name || user.email || 'Unknown',
      };

      await addDoc(collection(db, 'staff_events'), eventData);
      setNewEvent({
        title: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        type: 'outing',
        location: '',
      });
      setIsNewEventOpen(false);
      toast.success("Staff event created successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'staff_events');
    }
  };

  const handleDeleteStaffEvent = async (eventId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this event?")) return;

    try {
      await deleteDoc(doc(db, 'staff_events', eventId));
      toast.success("Staff event deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff_events/${eventId}`);
    }
  };

  const handleCreateCourse = async () => {
    if (!user || !isAdmin) return;
    if (!newCourse.title || !newCourse.description) {
      toast.error("Please provide a title and description for the course");
      return;
    }

    try {
      const courseData = {
        title: newCourse.title,
        description: newCourse.description,
        category: newCourse.category || 'Onboarding',
        thumbnailUrl: newCourse.thumbnailUrl || '',
        createdAt: new Date().toISOString(),
        createdBy: user.id,
      };

      const docRef = await addDoc(collection(db, 'courses'), courseData);
      setNewCourse({
        title: '',
        description: '',
        category: 'Onboarding',
        thumbnailUrl: '',
      });
      setIsNewCourseOpen(false);
      setActiveCourseId(docRef.id);
      toast.success("Course created successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'courses');
    }
  };

  const handleDeleteCourse = async (courseId: string) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this course? All chapters, lessons, and user progress records associated with it will be lost.")) return;

    try {
      await deleteDoc(doc(db, 'courses', courseId));
      
      // Delete associated chapters
      const chapsToDelete = chapters.filter(c => c.courseId === courseId);
      for (const chap of chapsToDelete) {
        await deleteDoc(doc(db, 'chapters', chap.id));
      }

      // Delete associated lessons
      const lessonsToDelete = lessons.filter(l => l.courseId === courseId);
      for (const les of lessonsToDelete) {
        await deleteDoc(doc(db, 'lessons', les.id));
      }

      if (activeCourseId === courseId) {
        setActiveCourseId(null);
        setActiveLessonId(null);
      }
      toast.success("Course and all associated content deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `courses/${courseId}`);
    }
  };

  const handleCreateChapter = async () => {
    if (!user || !isAdmin) return;
    const courseId = activeCourseId || newChapter.courseId;
    if (!courseId) {
      toast.error("Please select a course first");
      return;
    }
    if (!newChapter.title) {
      toast.error("Please enter a chapter title");
      return;
    }

    try {
      const chapterData = {
        courseId,
        title: newChapter.title,
        order: Number(newChapter.order) || 1,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'chapters'), chapterData);
      setNewChapter({
        courseId: '',
        title: '',
        order: (chapters.filter(c => c.courseId === courseId).length + 2),
      });
      setIsNewChapterOpen(false);
      toast.success("Chapter created successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'chapters');
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this chapter? All lessons inside this chapter will be deleted.")) return;

    try {
      await deleteDoc(doc(db, 'chapters', chapterId));

      // Delete lessons in this chapter
      const lessonsToDelete = lessons.filter(l => l.chapterId === chapterId);
      for (const les of lessonsToDelete) {
        await deleteDoc(doc(db, 'lessons', les.id));
      }
      
      toast.success("Chapter deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `chapters/${chapterId}`);
    }
  };

  const handleCreateLesson = async () => {
    if (!user || !isAdmin) return;
    const courseId = activeCourseId;
    const chapterId = newLesson.chapterId;
    if (!courseId || !chapterId) {
      toast.error("Please select a chapter first");
      return;
    }
    if (!newLesson.title) {
      toast.error("Please provide a lesson title");
      return;
    }

    try {
      const lessonData = {
        courseId,
        chapterId,
        title: newLesson.title,
        description: newLesson.description || '',
        videoUrl: newLesson.videoUrl || '',
        textBody: newLesson.textBody || '',
        duration: Number(newLesson.duration) || 5,
        order: Number(newLesson.order) || 1,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'lessons'), lessonData);
      setNewLesson({
        courseId: '',
        chapterId: '',
        title: '',
        description: '',
        videoUrl: '',
        textBody: '',
        duration: 5,
        order: (lessons.filter(l => l.chapterId === chapterId).length + 2),
      });
      setIsNewLessonOpen(false);
      toast.success("Lesson created successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'lessons');
    }
  };

  const handleDeleteLesson = async (lessonId: string) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this lesson?")) return;

    try {
      await deleteDoc(doc(db, 'lessons', lessonId));
      if (activeLessonId === lessonId) {
        setActiveLessonId(null);
      }
      toast.success("Lesson deleted successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `lessons/${lessonId}`);
    }
  };

  const handleToggleLessonProgress = async (lessonId: string, courseId: string) => {
    if (!user) return;
    const progressId = `${user.id}_${lessonId}`;
    const existing = progressList.find(p => p.lessonId === lessonId);

    try {
      if (existing) {
        // Toggle completion
        await deleteDoc(doc(db, 'course_progress', existing.id));
        toast.success("Lesson marked as incomplete");
      } else {
        // Create progress record
        const progressData: UserLessonProgress = {
          id: progressId,
          userId: user.id,
          courseId,
          lessonId,
          completed: true,
          completedAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'course_progress', progressId), progressData);
        toast.success("Lesson marked as completed! 🎉");
      }
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, 'course_progress');
    }
  };

  const handleUpdateLesson = async () => {
    if (!user || !isAdmin || !editingLessonId) return;
    if (!newLesson.title) {
      toast.error("Please provide a lesson title");
      return;
    }

    try {
      await updateDoc(doc(db, 'lessons', editingLessonId), {
        title: newLesson.title,
        description: newLesson.description || '',
        videoUrl: newLesson.videoUrl || '',
        textBody: newLesson.textBody || '',
        duration: Number(newLesson.duration) || 5,
        order: Number(newLesson.order) || 1,
      });

      setNewLesson({
        courseId: '',
        chapterId: '',
        title: '',
        description: '',
        videoUrl: '',
        textBody: '',
        duration: 5,
        order: 1,
      });
      setEditingLessonId(null);
      setIsNewLessonOpen(false);
      toast.success("Lesson updated successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `lessons/${editingLessonId}`);
    }
  };

  const handleCreateVacation = async () => {
    if (!newVacation.userId || !newVacation.startDate || !newVacation.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    const selectedTrainer = trainers.find(t => t.id === newVacation.userId);
    const start = new Date(newVacation.startDate);
    const end = new Date(newVacation.endDate);

    if (end < start) {
      toast.error("End date cannot be before start date");
      return;
    }

    const diffTime = Math.abs(end.getTime() - start.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (isNaN(totalDays)) {
      toast.error("Invalid start or end date");
      return;
    }

    try {
      if (editingVacationId) {
        const vacationData = {
          userId: newVacation.userId,
          userName: selectedTrainer?.name || 'Unknown',
          startDate: newVacation.startDate,
          endDate: newVacation.endDate,
          type: newVacation.type,
          hours: Number(newVacation.hours) || 8,
          notes: newVacation.notes,
          totalDays,
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'vacations', editingVacationId), vacationData);
        toast.success("Vacation request updated");
      } else {
        const vacationData = {
          userId: newVacation.userId,
          userName: selectedTrainer?.name || 'Unknown',
          startDate: newVacation.startDate,
          endDate: newVacation.endDate,
          status: 'pending' as VacationStatus,
          type: newVacation.type,
          hours: Number(newVacation.hours) || 8,
          notes: newVacation.notes,
          createdAt: new Date().toISOString(),
          totalDays
        };
        const vacationDocRef = await addDoc(collection(db, 'vacations'), vacationData);
        toast.success("Vacation request submitted");

        // Send email alerts to location admins and owners
        try {
          const recipients = trainers.filter(t => 
            (t.role === 'admin' && t.location === selectedTrainer?.location) || 
            t.role === 'owner'
          );

          const baseUrl = window.location.origin || 'https://vasta-dashboard.web.app';
          const approvalLink = `${baseUrl}/?tab=vacations`;
          const approveLink = `${baseUrl}/?tab=vacations&action=approve&vacationId=${vacationDocRef.id}`;
          const rejectLink = `${baseUrl}/?tab=vacations&action=reject&vacationId=${vacationDocRef.id}`;

          for (const recipient of recipients) {
            if (recipient.email) {
              await addDoc(collection(db, 'mail'), {
                to: recipient.email,
                message: {
                  subject: `New Vacation Request: ${selectedTrainer?.name}`,
                  html: `
                    <div style="font-family: sans-serif; padding: 25px; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
                      <div style="text-align: center; margin-bottom: 20px;">
                        <span style="font-weight: bold; font-size: 20px; color: #dc2626; letter-spacing: -0.5px;">Vasta Personal Training</span>
                      </div>
                      <h2 style="color: #0f172a; font-size: 18px; margin-top: 0; border-bottom: 1px solid #f1f5f9; padding-bottom: 12px; font-weight: 700;">New Vacation Request</h2>
                      <p style="font-size: 14px; line-height: 1.5; color: #334155;">Hi <strong>${recipient.name}</strong>,</p>
                      <p style="font-size: 14px; line-height: 1.5; color: #334155;"><strong>${selectedTrainer?.name}</strong> has submitted a new vacation request for your review.</p>
                      
                      <div style="background-color: #f8fafc; padding: 18px; border-radius: 8px; border: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569;"><strong style="color: #0f172a;">Staff Member:</strong> ${selectedTrainer?.name}</p>
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569;"><strong style="color: #0f172a;">Location:</strong> ${selectedTrainer?.location || 'N/A'}</p>
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569;"><strong style="color: #0f172a;">Dates:</strong> ${new Date(vacationData.startDate).toLocaleDateString()} to ${new Date(vacationData.endDate).toLocaleDateString()}</p>
                        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569;"><strong style="color: #0f172a;">Type:</strong> ${vacationData.type.charAt(0).toUpperCase() + vacationData.type.slice(1)}</p>
                        <p style="margin: 0; font-size: 13px; color: #475569;"><strong style="color: #0f172a;">Notes:</strong> ${vacationData.notes || 'No notes provided.'}</p>
                      </div>

                      <p style="font-size: 14px; line-height: 1.5; color: #334155; margin-bottom: 20px;">
                        Review and process this request instantly by clicking one of the buttons below:
                      </p>
                      
                      <div style="text-align: center; margin: 24px 0;">
                        <a href="${approveLink}" style="display: inline-block; background-color: #16a34a; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 6px; font-size: 14px; box-shadow: 0 2px 4px rgba(22,163,74,0.15); margin-right: 12px; margin-bottom: 10px;">✔ Approve Request</a>
                        <a href="${rejectLink}" style="display: inline-block; background-color: #dc2626; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 6px; font-size: 14px; box-shadow: 0 2px 4px rgba(220,38,38,0.15); margin-bottom: 10px;">✘ Reject Request</a>
                      </div>

                      <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 10px; font-style: italic;">
                        Clicking either option will prompt you to securely sign in (if not already) and auto-execute the action directly on the dashboard.
                      </p>

                      <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin-top: 25px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                        Or, view all requests in the dashboard:<br />
                        <a href="${approvalLink}" style="color: #dc2626; word-break: break-all;">${approvalLink}</a>
                      </p>
                      
                      <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
                      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin: 0;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                    </div>
                  `
                }
              });
            }
          }
        } catch (emailError) {
          console.error("Error sending vacation alerts:", emailError);
        }
      }

      setNewVacation({ 
        userId: '', 
        startDate: new Date().toISOString().split('T')[0], 
        endDate: new Date().toISOString().split('T')[0], 
        type: 'vacation', 
        hours: 8,
        notes: '' 
      });
      setIsNewVacationOpen(false);
      setEditingVacationId(null);
    } catch (error) {
      handleFirestoreError(error, editingVacationId ? OperationType.UPDATE : OperationType.CREATE, 'vacations');
    }
  };

  const handleEditVacation = (vacation: VacationRequest) => {
    if (!isAdmin) {
      toast.error("Only administrators can edit vacation requests.");
      return;
    }
    setNewVacation({
      userId: vacation.userId,
      startDate: vacation.startDate,
      endDate: vacation.endDate,
      type: vacation.type,
      hours: vacation.hours || 8,
      notes: vacation.notes || ''
    });
    setEditingVacationId(vacation.id);
    setIsNewVacationOpen(true);
  };

  const handleUpdateVacationStatus = async (vacationId: string, status: VacationStatus) => {
    if (!user || !isAdmin) return;
    try {
      await updateDoc(doc(db, 'vacations', vacationId), { status });
      toast.success(`Vacation request ${status}`);
      
      // Notify the user who requested the vacation
      const vacation = vacations.find(v => v.id === vacationId);
      if (vacation && vacation.userId) {
        const trainer = trainers.find(t => t.id === vacation.userId);
        if (trainer && trainer.email) {
          try {
            await addDoc(collection(db, 'mail'), {
              to: trainer.email,
              message: {
                subject: `Vacation Request ${status.charAt(0).toUpperCase() + status.slice(1)}`,
                html: `
                  <div style="font-family: sans-serif; padding: 20px; color: #333;">
                    <h2 style="color: ${status === 'approved' ? '#22c55e' : '#ef4444'};">Vacation Request ${status.charAt(0).toUpperCase() + status.slice(1)}</h2>
                    <p>Hi <strong>${trainer.name}</strong>,</p>
                    <p>Your vacation request for <strong>${new Date(vacation.startDate).toLocaleDateString()} to ${new Date(vacation.endDate).toLocaleDateString()}</strong> has been <strong>${status}</strong> by an administrator.</p>
                    <p>Please log in to the dashboard for more details.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #94a3b8;">This is an automated notification from the Vasta Personal Training Dashboard.</p>
                  </div>
                `
              }
            });
          } catch (emailError) {
            console.error("Error sending vacation status update email:", emailError);
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vacations/${vacationId}`);
    }
  };

  const handleRemoveVacation = async (vacationId: string) => {
    if (!user || !isAdmin) return;
    if (!window.confirm("Are you sure you want to delete this vacation record?")) return;
    try {
      await deleteDoc(doc(db, 'vacations', vacationId));
      toast.success("Vacation record deleted");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vacations/${vacationId}`);
    }
  };

  const handleCreateInventoryItem = async () => {
    if (!newInventoryItem.name || !newInventoryItem.category) {
      toast.error("Name and Category are required");
      return;
    }

    try {
      const itemData = {
        ...newInventoryItem,
        updatedAt: new Date().toISOString()
      };

      if (editingItemId) {
        await updateDoc(doc(db, 'inventory', editingItemId), itemData);
        toast.success("Inventory item updated");
      } else {
        await addDoc(collection(db, 'inventory'), itemData);
        toast.success("Inventory item added");
      }

      setNewInventoryItem({ 
        name: '', 
        category: 'equipment', 
        location: 'Dorset Street',
        quantity: 0, 
        price: 0, 
        productLink: '' 
      });
      setIsNewInventoryOpen(false);
      setEditingItemId(null);
    } catch (error) {
      handleFirestoreError(error, editingItemId ? OperationType.UPDATE : OperationType.CREATE, 'inventory');
    }
  };

  const handleEditInventoryItem = (item: InventoryItem) => {
    if (user?.role !== 'admin' && user?.role !== 'trainer') {
      toast.error("Only staff members can edit inventory.");
      return;
    }
    setNewInventoryItem({
      name: item.name,
      category: item.category,
      location: item.location,
      quantity: item.quantity,
      price: item.price || 0,
      productLink: item.productLink || ''
    });
    setEditingItemId(item.id);
    setIsNewInventoryOpen(true);
  };

  const handleRemoveInventoryItem = async (itemId: string) => {
    if (!user || user.role !== 'admin') return;
    if (!window.confirm("Are you sure you want to remove this item?")) return;
    try {
      await deleteDoc(doc(db, 'inventory', itemId));
      toast.success("Inventory item removed");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${itemId}`);
    }
  };

  const handleSubmitInventoryReport = async () => {
    if (!user || !selectedReportLocation) {
      toast.error("Please select a location");
      return;
    }

    const itemsToRecord: InventoryReportItem[] = inventoryItems
      .filter(item => item.location === selectedReportLocation && auditedItemIds[item.id])
      .map(item => ({
        itemId: item.id,
        itemName: item.name,
        quantity: reportItemCounts[item.id] ?? item.quantity
      }));

    if (itemsToRecord.length === 0) {
      toast.error("Please select at least one item to audit");
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // 1. Create the report
      const reportId = crypto.randomUUID();
      const reportRef = doc(db, 'inventoryReports', reportId);
      const reportData: InventoryReport = {
        id: reportId,
        location: selectedReportLocation as Location,
        reportedBy: user.id,
        reportedByName: user.name,
        reportedAt: new Date().toISOString(),
        items: itemsToRecord,
        notes: reportNotes
      };
      batch.set(reportRef, reportData);

      // 2. Update master inventory quantities
      itemsToRecord.forEach(reportItem => {
        const itemRef = doc(db, 'inventory', reportItem.itemId);
        batch.update(itemRef, {
          quantity: reportItem.quantity,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      
      toast.success(`Inventory audit report submitted! Updated ${itemsToRecord.length} checked item(s).`);
      setIsInventoryReportOpen(false);
      setSelectedReportLocation('');
      setReportItemCounts({});
      setAuditedItemIds({});
      setReportNotes('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventoryReports');
    }
  };

  const handleSubmitRestockRequest = async () => {
    if (!user || !selectedRestockLocation) {
      toast.error("Please select a location");
      return;
    }

    const itemsRequested = inventoryItems
      .filter(item => item.location === selectedRestockLocation && restockItemIds[item.id])
      .map(item => ({
        id: item.id,
        name: item.name,
        category: item.category,
        currentQuantity: item.quantity,
        requestedQuantity: restockItemQuantities[item.id] ?? 5
      }));

    if (itemsRequested.length === 0) {
      toast.error("Please select at least one item to request a restock");
      return;
    }

    try {
      const recipients = trainers.filter(t => 
        (t.role === 'admin' && t.location === selectedRestockLocation) || 
        t.role === 'owner'
      );

      const itemsListHtml = itemsRequested.map(item => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; font-weight: bold; color: #334155;">${item.name}</td>
          <td style="padding: 10px; color: #64748b; text-transform: capitalize;">${item.category.replace('-', ' ')}</td>
          <td style="padding: 10px; text-align: center; color: #64748b;">${item.currentQuantity}</td>
          <td style="padding: 10px; text-align: center; font-weight: bold; color: #dc2626;">${item.requestedQuantity}</td>
        </tr>
      `).join('');

      for (const recipient of recipients) {
        if (recipient.email) {
          await addDoc(collection(db, 'mail'), {
            to: recipient.email,
            message: {
              subject: `🛒 Restock Request: ${selectedRestockLocation} - Submitted by ${user.name}`,
              html: `
                <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                  <div style="background-color: #dc2626; color: white; padding: 15px 20px; border-radius: 8px 8px 0 0; margin: -20px -20px 20px -20px;">
                    <h2 style="margin: 0; font-size: 20px; font-weight: bold;">
                      🛒 New Restock Request
                    </h2>
                  </div>
                  
                  <p>Hi <strong>${recipient.name}</strong>,</p>
                  <p>A new inventory restock request has been submitted by <strong>${user.name}</strong> for the <strong>${selectedRestockLocation}</strong> facility.</p>
                  
                  <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                      <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                        <th style="padding: 10px; color: #475569; font-size: 13px;">Item Name</th>
                        <th style="padding: 10px; color: #475569; font-size: 13px;">Category</th>
                        <th style="padding: 10px; color: #475569; font-size: 13px; text-align: center;">Current Stock</th>
                        <th style="padding: 10px; color: #475569; font-size: 13px; text-align: center;">Requested Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsListHtml}
                    </tbody>
                  </table>

                  ${restockNotes ? `
                    <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 20px 0;">
                      <p style="margin: 0 0 5px 0; font-weight: bold; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Request Notes:</p>
                      <p style="margin: 0; color: #334155; font-style: italic;">"${restockNotes}"</p>
                    </div>
                  ` : ''}
                  
                  <p>Please review local inventory and coordinate purchasing as needed.</p>
                  
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                  <p style="font-size: 12px; color: #94a3b8; margin: 0; text-align: center;">This is an automated request form from the Vasta Personal Training Dashboard.</p>
                </div>
              `
            }
          });
        }
      }

      toast.success(`Restock request sent to location manager and owner for ${itemsRequested.length} item(s)!`);
      setIsRestockRequestOpen(false);
      setSelectedRestockLocation('');
      setRestockItemIds({});
      setRestockItemQuantities({});
      setRestockNotes('');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'restockRequests');
    }
  };

  const handleAddQuestion = async (taskId: string) => {
    if (!newQuestion.trim() || !user) return;

    const question: TaskQuestion = {
      id: crypto.randomUUID(),
      text: newQuestion.trim(),
      createdAt: new Date().toISOString(),
      authorName: user.name,
      isAnswered: false
    };

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        questions: arrayUnion(question)
      });
      setNewQuestion('');
      toast.success("Question posted");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const handleAnswerQuestion = async (taskId: string, questionId: string, answer: string) => {
    if (!answer.trim() || !user || !selectedTask) return;

    const updatedQuestions = (selectedTask.questions || []).map(q => 
      q.id === questionId ? { ...q, isAnswered: true, answer: answer.trim() } : q
    );

    try {
      await updateDoc(doc(db, 'tasks', taskId), {
        questions: updatedQuestions
      });
      toast.success("Answer posted");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${taskId}`);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getStatusIcon = (status: TaskStatus) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'in-progress': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'pending': return <AlertCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const getVacationsForDay = (date: Date) => {
    return vacations.filter(v => {
      try {
        const start = parseISO(v.startDate);
        const end = parseISO(v.endDate);
        return isWithinInterval(date, { start, end });
      } catch (e) {
        return false;
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const getCertStatus = (cert: Certification) => {
    if (cert.isInProgress) return { label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-100' };
    if (!cert.expirationDate) return { label: 'Active', color: 'bg-green-50 text-green-700 border-green-100' };
    
    try {
      const expDate = new Date(cert.expirationDate);
      const now = new Date();
      if (expDate < now) {
        return { label: 'Expired', color: 'bg-red-50 text-red-700 border-red-100' };
      }
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (expDate.getTime() - now.getTime() < thirtyDays) {
        return { label: 'Expiring Soon', color: 'bg-amber-50 text-amber-700 border-amber-100' };
      }
    } catch (e) {
      // Ignored
    }
    return { label: 'Active', color: 'bg-green-50 text-green-700 border-green-100' };
  };

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex font-sans text-slate-900 border-t-4 border-transparent flex-col transition-all duration-500">
      {/* System Status Banner */}
      <div className="flex min-h-screen">
        {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-200">
            <LayoutDashboard className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">Vasta</h1>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Management</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          <button 
            onClick={() => setActiveTab('tasks')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'tasks' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <CheckSquare className="w-5 h-5" />
            <span>Tasks</span>
          </button>
          <button 
            onClick={() => setActiveTab('team')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'team' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Users className="w-5 h-5" />
            <span>Team</span>
          </button>
          <button 
            onClick={() => setActiveTab('staff')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'staff' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Award className="w-5 h-5" />
            <span>Staff Info</span>
          </button>
          <button 
            onClick={() => setActiveTab('vacations')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'vacations' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Umbrella className="w-5 h-5" />
            <span>Vacations</span>
          </button>
          <button 
            onClick={() => setActiveTab('inventory')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'inventory' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Package className="w-5 h-5" />
            <span>Inventory</span>
          </button>
          <button 
            onClick={() => setActiveTab('resources')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'resources' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <ExternalLink className="w-5 h-5" />
            <span>Resources</span>
          </button>
          <button 
            onClick={() => setActiveTab('marketing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'marketing' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Megaphone className="w-5 h-5" />
            <span>Marketing</span>
          </button>
          <button 
            onClick={() => setActiveTab('onboarding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'onboarding' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <GraduationCap className="w-5 h-5" />
            <span>Onboarding/Education</span>
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="bg-slate-50 rounded-xl p-4 flex items-center gap-3">
            <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
              <AvatarImage src={user?.photoURL || `https://picsum.photos/seed/${user?.email}/100/100`} />
              <AvatarFallback>{user?.name?.[0] || 'U'}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
            <button onClick={logout} className="text-slate-400 hover:text-slate-600">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              {activeTab === 'tasks' && 'Administrative Tasks'}
              {activeTab === 'team' && 'Team Management'}
              {activeTab === 'staff' && 'Staff Directory & Certifications'}
              {activeTab === 'inventory' && 'Inventory Management'}
              {activeTab === 'vacations' && 'Vacations & Time-off'}
              {activeTab === 'resources' && 'Team Resources'}
              {activeTab === 'marketing' && 'Marketing'}
              {activeTab === 'onboarding' && 'Onboarding & Team Education'}
            </h2>
            <p className="text-slate-500 mt-1">
              {activeTab === 'tasks' && 'Assign and track progress of team operations.'}
              {activeTab === 'team' && 'Manage trainers and their roles within the team.'}
              {activeTab === 'staff' && 'Track trainer qualifications, renewals, and progress.'}
              {activeTab === 'inventory' && 'Track equipment, retail items, and staff supplies.'}
              {activeTab === 'vacations' && 'Track approved and pending time-off requests.'}
              {activeTab === 'resources' && 'Quick access to frequently used Google Docs and links.'}
              {activeTab === 'marketing' && 'Google Sheets based campaign tracker and resource.'}
              {activeTab === 'onboarding' && 'Complete your onboarding modules, watch instruction videos, and track your progress.'}
            </p>
          </div>

          <div className="flex gap-3">
            {activeTab === 'onboarding' && (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button
                    onClick={() => setIsOnboardingAdminMode(!isOnboardingAdminMode)}
                    variant="outline"
                    className="border-slate-200 text-xs font-semibold"
                  >
                    {isOnboardingAdminMode ? '👁️ Learner Mode' : '⚙️ Course Builder Mode'}
                  </Button>
                )}
                {isOnboardingAdminMode && isAdmin && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setIsNewCourseOpen(true)}
                      className="bg-red-600 hover:bg-red-700 text-xs font-semibold"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Course
                    </Button>
                    <Button
                      onClick={() => {
                        if (courses.length === 0) {
                          toast.error("Please create a course first");
                          return;
                        }
                        setIsNewChapterOpen(true);
                      }}
                      variant="outline"
                      className="text-xs font-semibold border-slate-200"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Chapter
                    </Button>
                    <Button
                      onClick={() => {
                        if (chapters.length === 0) {
                          toast.error("Please create a chapter first");
                          return;
                        }
                        setIsNewLessonOpen(true);
                      }}
                      variant="outline"
                      className="text-xs font-semibold border-slate-200"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" /> Lesson
                    </Button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'tasks' && (
              <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
                <DialogTrigger
                  render={
                    <Button className="bg-red-600 hover:bg-red-700 shadow-md shadow-red-100 gap-2">
                      <Plus className="w-4 h-4" />
                      New Task
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Assign New Task</DialogTitle>
                    <DialogDescription>
                      Fill in the details to assign a new administrative task to a team member.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="title">Task Title</Label>
                      <Input 
                        id="title" 
                        placeholder="e.g. Inventory Audit" 
                        value={newTask.title}
                        onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea 
                        id="description" 
                        placeholder="Provide details about the task..." 
                        value={newTask.description}
                        onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label className="text-slate-700 font-semibold mb-1">Assign To (Select one or more)</Label>
                      <div className="border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto space-y-1.5 bg-white shadow-sm">
                        {trainers.map(t => {
                          const isChecked = newTask.assignedToIds.includes(t.id);
                          return (
                            <label key={t.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-slate-50 p-2 rounded-md transition-all select-none border border-transparent hover:border-slate-100">
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setNewTask({
                                      ...newTask,
                                      assignedToIds: newTask.assignedToIds.filter(id => id !== t.id)
                                    });
                                  } else {
                                    setNewTask({
                                      ...newTask,
                                      assignedToIds: [...newTask.assignedToIds, t.id]
                                    });
                                  }
                                }}
                                className="rounded text-red-600 focus:ring-red-500 h-4 w-4 border-slate-300 accent-red-600 cursor-pointer"
                              />
                              <div className="flex items-center gap-2">
                                <Avatar className="w-5 h-5">
                                  <AvatarImage src={t.photoURL || `https://picsum.photos/seed/${t.id}/100/100`} />
                                  <AvatarFallback className="text-[9px]">{t.name[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-semibold text-slate-700">{t.name}</span>
                                <span className="text-[10px] text-slate-400 capitalize">({t.role})</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="dueDate">Due Date</Label>
                        <Input 
                          id="dueDate" 
                          type="date" 
                          value={newTask.dueDate}
                          onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select 
                          value={newTask.priority} 
                          onValueChange={(val) => setNewTask({ ...newTask, priority: val as Priority })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsNewTaskOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateTask} className="bg-red-600 hover:bg-red-700">Assign Task</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {activeTab === 'resources' && (
              <div className="flex gap-2">
                {resourcesSubTab === 'links' && isAdmin && (
                  <Dialog open={isNewResourceOpen} onOpenChange={setIsNewResourceOpen}>
                    <DialogTrigger
                      render={
                        <Button className="bg-red-600 hover:bg-red-700 shadow-md shadow-red-100 gap-2">
                          <Plus className="w-4 h-4" />
                          Add Resource
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add New Resource</DialogTitle>
                        <DialogDescription>
                          Add a link to a Google Doc or other frequently used team resource.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="res-title">Title</Label>
                          <Input 
                            id="res-title" 
                            placeholder="e.g. Staff Handbook" 
                            value={newResource.title}
                            onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="res-url">URL</Label>
                          <Input 
                            id="res-url" 
                            placeholder="docs.google.com/..." 
                            value={newResource.url}
                            onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="res-category">Category (Optional)</Label>
                          <Input 
                            id="res-category" 
                            placeholder="e.g. Training, Admin, Guides" 
                            value={newResource.category}
                            onChange={(e) => setNewResource({ ...newResource, category: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewResourceOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateResource} className="bg-red-600 hover:bg-red-700">Add Link</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}

                {resourcesSubTab === 'calendar' && (
                  <Dialog open={isNewEventOpen} onOpenChange={setIsNewEventOpen}>
                    <DialogTrigger
                      render={
                        <Button className="bg-red-600 hover:bg-red-700 shadow-md shadow-red-100 gap-2">
                          <Plus className="w-4 h-4" />
                          Add Staff Event
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-[450px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add Staff Event</DialogTitle>
                        <DialogDescription>
                          Create a new team outing, staff meeting, or other event.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="event-title">Event Title</Label>
                          <Input 
                            id="event-title" 
                            placeholder="e.g. Team Dinner & Bowling" 
                            value={newEvent.title}
                            onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="event-date">Date</Label>
                          <Input 
                            id="event-date" 
                            type="date"
                            value={newEvent.date}
                            onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="event-type">Type</Label>
                          <Select 
                            value={newEvent.type} 
                            onValueChange={(val: 'outing' | 'meeting' | 'party' | 'other') => setNewEvent({ ...newEvent, type: val })}
                          >
                            <SelectTrigger id="event-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="outing">Team Outing</SelectItem>
                              <SelectItem value="meeting">Staff Meeting</SelectItem>
                              <SelectItem value="party">Staff Party</SelectItem>
                              <SelectItem value="other">Other Event</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="event-location">Location (Optional)</Label>
                          <Input 
                            id="event-location" 
                            placeholder="e.g. Dorset Street gym" 
                            value={newEvent.location}
                            onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="event-desc">Description (Optional)</Label>
                          <Textarea 
                            id="event-desc" 
                            placeholder="Add details about the event..." 
                            value={newEvent.description}
                            onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewEventOpen(false)}>Cancel</Button>
                        <Button onClick={handleCreateStaffEvent} className="bg-red-600 hover:bg-red-700">Create Event</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="flex gap-2">
                <Button 
                  onClick={() => setIsInventoryReportOpen(true)}
                  variant="outline"
                  className="gap-2 border-slate-200 hover:bg-slate-50"
                >
                  <ClipboardCheck className="w-4 h-4 text-red-600" />
                  Audit Inventory
                </Button>

                <Button 
                  onClick={() => {
                    setIsRestockRequestOpen(true);
                    setSelectedRestockLocation('');
                    setRestockItemIds({});
                    setRestockItemQuantities({});
                    setRestockNotes('');
                  }}
                  variant="outline"
                  className="gap-2 border-slate-200 hover:bg-slate-50"
                >
                  <ShoppingCart className="w-4 h-4 text-red-600" />
                  Request Restock
                </Button>

                <Dialog open={isNewInventoryOpen} onOpenChange={(open) => {
                setIsNewInventoryOpen(open);
                if (!open) {
                  setEditingItemId(null);
                  setNewInventoryItem({ 
                    name: '', 
                    category: 'equipment', 
                    location: 'Dorset Street',
                    quantity: 0, 
                    price: 0, 
                    productLink: '' 
                  });
                }
              }}>
                <DialogTrigger
                  render={
                    <Button className="bg-red-600 hover:bg-red-700 shadow-md shadow-red-100 gap-2">
                      <Plus className="w-4 h-4" />
                      Add Item
                    </Button>
                  }
                />
                <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingItemId ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
                    <DialogDescription>
                      {editingItemId ? 'Update details for this item.' : 'Add a new item to your facility inventory.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="item-name">Item Name</Label>
                      <Input 
                        id="item-name" 
                        placeholder="e.g. Foam Roller, Protein Shake" 
                        value={newInventoryItem.name}
                        onChange={(e) => setNewInventoryItem({ ...newInventoryItem, name: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Category</Label>
                      <Select 
                        value={newInventoryItem.category} 
                        onValueChange={(val) => setNewInventoryItem({ ...newInventoryItem, category: val as InventoryCategory })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="equipment">Equipment (Facility)</SelectItem>
                          <SelectItem value="retail-equipment">Equipment (Sale)</SelectItem>
                          <SelectItem value="retail-food-drink">Food & Drink (Sale)</SelectItem>
                          <SelectItem value="retail-apparel">Apparel (Sale)</SelectItem>
                          <SelectItem value="staff-apparel">Apparel (Staff)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Location</Label>
                      <Select 
                        value={newInventoryItem.location} 
                        onValueChange={(val) => setNewInventoryItem({ ...newInventoryItem, location: val as Location })}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                          <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                          <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="item-quantity">Quantity</Label>
                        <Input 
                          id="item-quantity" 
                          type="number" 
                          min="0"
                          value={isNaN(newInventoryItem.quantity) ? '' : newInventoryItem.quantity}
                          onChange={(e) => {
                            const val = parseInt(e.target.value);
                            setNewInventoryItem({ ...newInventoryItem, quantity: isNaN(val) ? 0 : val });
                          }}
                        />
                      </div>
                      {newInventoryItem.category !== 'equipment' && newInventoryItem.category !== 'staff-apparel' && (
                        <div className="grid gap-2">
                          <Label htmlFor="item-price">Sale Price ($)</Label>
                          <Input 
                            id="item-price" 
                            type="number" 
                            min="0"
                            step="0.01"
                             value={isNaN(newInventoryItem.price || 0) ? '' : newInventoryItem.price}
                             onChange={(e) => {
                               const val = parseFloat(e.target.value);
                               setNewInventoryItem({ ...newInventoryItem, price: isNaN(val) ? 0 : val });
                             }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="item-link">Product Link</Label>
                      <Input 
                        id="item-link" 
                        placeholder="https://example.com/product" 
                        value={newInventoryItem.productLink}
                        onChange={(e) => setNewInventoryItem({ ...newInventoryItem, productLink: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCreateInventoryItem} className="w-full bg-red-600 hover:bg-red-700">
                      {editingItemId ? 'Update Item' : 'Add Item'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            )}

            {/* Inventory Report Dialog */}
            <Dialog open={isInventoryReportOpen} onOpenChange={setIsInventoryReportOpen}>
              <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Inventory Audit Report</DialogTitle>
                  <DialogDescription>
                    Select a location to record current stock levels for all items.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4 flex-1 overflow-y-auto">
                  <div className="grid gap-2">
                    <Label htmlFor="report-location">Location</Label>
                    <Select 
                      value={selectedReportLocation} 
                      onValueChange={(val) => {
                        const loc = val as Location;
                        setSelectedReportLocation(loc);
                        setReportItemCounts({});
                        
                        // Default all items for the selected location to audited/checked
                        const initialSelected: Record<string, boolean> = {};
                        inventoryItems
                          .filter(item => item.location === loc)
                          .forEach(item => {
                            initialSelected[item.id] = true;
                          });
                        setAuditedItemIds(initialSelected);
                      }}
                    >
                      <SelectTrigger id="report-location" className="w-full">
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                        <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                        <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedReportLocation && (
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-2">
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Items at {selectedReportLocation}</h4>
                          <div className="flex items-center gap-1.5 pb-0.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 py-0.5 font-bold border-slate-200 hover:bg-slate-100 bg-white text-slate-700 hover:text-slate-900 shadow-xs"
                              onClick={() => {
                                const currentLocItems = inventoryItems.filter(item => item.location === selectedReportLocation);
                                const nextState = { ...auditedItemIds };
                                currentLocItems.forEach(item => {
                                  nextState[item.id] = true;
                                });
                                setAuditedItemIds(nextState);
                              }}
                            >
                              Check All
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 text-[10px] px-2 py-0.5 font-bold border-slate-200 hover:bg-slate-100 bg-white text-slate-700 hover:text-slate-900 shadow-xs"
                              onClick={() => {
                                const currentLocItems = inventoryItems.filter(item => item.location === selectedReportLocation);
                                const nextState = { ...auditedItemIds };
                                currentLocItems.forEach(item => {
                                  nextState[item.id] = false;
                                });
                                setAuditedItemIds(nextState);
                              }}
                            >
                              Uncheck All
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {inventoryItems
                            .filter(item => item.location === selectedReportLocation)
                            .map(item => {
                              const isAudited = !!auditedItemIds[item.id];
                              return (
                                <div 
                                  key={item.id} 
                                  className={`flex items-center justify-between gap-4 p-2 rounded-md border shadow-sm transition-all duration-200 ${
                                    isAudited 
                                      ? 'bg-red-50/20 border-red-100 hover:bg-red-50/30' 
                                      : 'bg-slate-50 border-slate-200 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <Checkbox 
                                      id={`audit-item-${item.id}`}
                                      checked={isAudited}
                                      onCheckedChange={(checked) => {
                                        setAuditedItemIds({
                                          ...auditedItemIds,
                                          [item.id]: !!checked
                                        });
                                      }}
                                    />
                                    <Label 
                                      htmlFor={`audit-item-${item.id}`}
                                      className="min-w-0 flex-1 select-none cursor-pointer space-y-0.5"
                                    >
                                      <p className={`text-sm font-semibold truncate ${isAudited ? 'text-slate-900' : 'text-slate-500'}`}>{item.name}</p>
                                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.category.replace('-', ' ')}</p>
                                    </Label>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">Current: {item.quantity}</p>
                                      <Input
                                        type="number"
                                        disabled={!isAudited}
                                        value={!isAudited ? '' : (isNaN(reportItemCounts[item.id] ?? item.quantity) ? '' : (reportItemCounts[item.id] ?? item.quantity))}
                                        onChange={(e) => {
                                          const val = parseInt(e.target.value);
                                          setReportItemCounts({ 
                                            ...reportItemCounts, 
                                            [item.id]: isNaN(val) ? 0 : val 
                                          });
                                        }}
                                        className="w-20 h-8 text-sm focus-visible:ring-red-500 bg-white"
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          }
                          {inventoryItems.filter(item => item.location === selectedReportLocation).length === 0 && (
                            <p className="text-sm text-slate-500 italic text-center py-4">No items listed for this location.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="audit-notes">Audit Notes</Label>
                        <Input 
                          id="audit-notes"
                          placeholder="Any discrepancies or notes about this audit..."
                          value={reportNotes}
                          onChange={(e) => setReportNotes(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setIsInventoryReportOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmitInventoryReport}
                    disabled={!selectedReportLocation}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Submit Audit Report
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Inventory Restock Request Dialog */}
            <Dialog open={isRestockRequestOpen} onOpenChange={setIsRestockRequestOpen}>
              <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ShoppingCart className="w-5 h-5 text-red-600" />
                    Request Inventory Restock
                  </DialogTitle>
                  <DialogDescription>
                    Select a location and choose the items you want to request a restock for. An email alert will be sent to the location manager and owner.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4 flex-1 overflow-y-auto">
                  <div className="grid gap-2">
                    <Label htmlFor="restock-location">Location</Label>
                    <Select 
                      value={selectedRestockLocation} 
                      onValueChange={(val) => {
                        const loc = val as Location;
                        setSelectedRestockLocation(loc);
                        
                        const initialSelected: Record<string, boolean> = {};
                        const initialQuantities: Record<string, number> = {};
                        inventoryItems
                          .filter(item => item.location === loc)
                          .forEach(item => {
                            initialSelected[item.id] = false;
                            initialQuantities[item.id] = 5; // Default request quantity
                          });
                        setRestockItemIds(initialSelected);
                        setRestockItemQuantities(initialQuantities);
                      }}
                    >
                      <SelectTrigger id="restock-location" className="w-full">
                        <SelectValue placeholder="Select Location" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                        <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                        <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedRestockLocation && (
                    <div className="space-y-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Items at {selectedRestockLocation}</h4>
                        <div className="space-y-3">
                          {inventoryItems
                            .filter(item => item.location === selectedRestockLocation)
                            .map(item => {
                              const isChecked = !!restockItemIds[item.id];
                              return (
                                <div 
                                  key={item.id} 
                                  className={`flex items-center justify-between gap-4 p-2 rounded-md border shadow-sm transition-all duration-200 ${
                                    isChecked 
                                      ? 'bg-red-50/20 border-red-100 hover:bg-red-50/30' 
                                      : 'bg-slate-50 border-slate-200 opacity-60'
                                  }`}
                                >
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <Checkbox 
                                      id={`restock-item-${item.id}`}
                                      checked={isChecked}
                                      onCheckedChange={(checked) => {
                                        setRestockItemIds({
                                          ...restockItemIds,
                                          [item.id]: !!checked
                                        });
                                      }}
                                    />
                                    <Label 
                                      htmlFor={`restock-item-${item.id}`}
                                      className="min-w-0 flex-1 select-none cursor-pointer space-y-0.5"
                                    >
                                      <p className={`text-sm font-semibold truncate ${isChecked ? 'text-slate-900' : 'text-slate-500'}`}>{item.name}</p>
                                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{item.category.replace('-', ' ')}</p>
                                    </Label>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right">
                                      <div className="flex items-center gap-1.5">
                                        <p className="text-[10px] text-slate-400 font-medium leading-none mb-1">Current: {item.quantity}</p>
                                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-white">In Stock</Badge>
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <Label htmlFor={`qty-input-${item.id}`} className="text-[10px] text-slate-400">Request Qty:</Label>
                                        <Input
                                          id={`qty-input-${item.id}`}
                                          type="number"
                                          disabled={!isChecked}
                                          value={!isChecked ? '' : (isNaN(restockItemQuantities[item.id] ?? 5) ? '' : (restockItemQuantities[item.id] ?? 5))}
                                          onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setRestockItemQuantities({ 
                                              ...restockItemQuantities, 
                                              [item.id]: isNaN(val) ? 0 : val 
                                            });
                                          }}
                                          className="w-16 h-8 text-sm focus-visible:ring-red-500 bg-white"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          }
                          {inventoryItems.filter(item => item.location === selectedRestockLocation).length === 0 && (
                            <p className="text-sm text-slate-500 italic text-center py-4">No items listed for this location.</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2">
                        <Label htmlFor="restock-notes">Request Notes / Comments</Label>
                        <Textarea 
                          id="restock-notes"
                          placeholder="Provide any context, urgency, or instructions..."
                          value={restockNotes}
                          onChange={(e) => setRestockNotes(e.target.value)}
                          className="min-h-[80px]"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <DialogFooter className="mt-4">
                  <Button variant="outline" onClick={() => setIsRestockRequestOpen(false)}>Cancel</Button>
                  <Button 
                    onClick={handleSubmitRestockRequest}
                    disabled={!selectedRestockLocation}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Send Restock Request
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'tasks' && (
            <motion.div 
              key="tasks"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    placeholder="Search tasks or trainers..." 
                    className="pl-10 border-none bg-transparent focus-visible:ring-0"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className="h-6 w-[1px] bg-slate-200" />
                <Button variant="ghost" size="sm" className="gap-2 text-slate-600">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {['pending', 'in-progress', 'completed'].map((status) => (
                  <div key={status} className="space-y-4">
                    <div className="flex items-center justify-between px-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-700 capitalize">{status.replace('-', ' ')}</h3>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-medium">
                          {filteredTasks.filter(t => t.status === status).length}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      {filteredTasks.filter(t => t.status === status).map((task) => (
                        <Card 
                          key={task.id} 
                          className="group hover:shadow-md transition-all duration-200 border-slate-200 cursor-pointer"
                          onClick={() => setSelectedTaskId(task.id)}
                        >
                          <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                              <div className="flex gap-1.5">
                                <Badge className={`${getPriorityColor(task.priority)} border capitalize text-[10px] px-1.5 py-0`}>
                                  {task.priority}
                                </Badge>
                                {task.isRecurring && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-100 text-red-600 bg-red-50 flex items-center gap-1">
                                    <Repeat className="w-2.5 h-2.5" />
                                    {task.recurrenceInterval}
                                  </Badge>
                                )}
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <button 
                                      className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="w-4 h-4" />
                                    </button>
                                  }
                                />
                                <DropdownMenuContent align="end">
                                  <DropdownMenuGroup>
                                    <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'pending'); }}>Pending</DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'in-progress'); }}>In Progress</DropdownMenuItem>
                                    <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'completed'); }}>Completed</DropdownMenuItem>
                                  </DropdownMenuGroup>
                                  {(isAdmin || task.createdBy === user?.id) && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        className="text-red-600 focus:text-red-600 focus:bg-red-50" 
                                        onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                      >
                                        <Trash2 className="w-4 h-4 mr-2" />
                                        Delete Task
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <CardTitle className="text-base font-bold mt-2 leading-snug">{task.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">{task.description}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex -space-x-1.5 overflow-hidden">
                                  {task.assignedToIds && task.assignedToIds.length > 0 ? (
                                    task.assignedToIds.slice(0, 3).map((trainerId, idx) => {
                                      const tr = trainers.find(t => t.id === trainerId);
                                      return (
                                        <Avatar key={trainerId} className="w-6 h-6 border border-white" style={{ zIndex: 10 - idx }}>
                                          <AvatarImage src={tr?.photoURL || `https://picsum.photos/seed/${trainerId}/100/100`} />
                                          <AvatarFallback className="text-[8px]">{(tr?.name || 'U')[0]}</AvatarFallback>
                                        </Avatar>
                                      );
                                    })
                                  ) : (
                                    <Avatar className="w-6 h-6">
                                      <AvatarImage src={trainers.find(t => t.id === task.assignedTo)?.photoURL || `https://picsum.photos/seed/${task.assignedTo}/100/100`} />
                                      <AvatarFallback>{(task.assignedToName || 'U')[0]}</AvatarFallback>
                                    </Avatar>
                                  )}
                                  {task.assignedToIds && task.assignedToIds.length > 3 && (
                                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 border border-white text-[8px] font-bold text-slate-500 z-0">
                                      +{task.assignedToIds.length - 3}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-medium text-slate-600 truncate max-w-[100px]" title={task.assignedToName}>{task.assignedToName}</span>
                                  {task.createdByName && (
                                    <span className="text-[9px] text-slate-400">By: {task.createdByName}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1 text-slate-400">
                                <Clock className="w-3 h-3" />
                                <span className="text-[10px] font-medium">{format(new Date(task.dueDate), 'MMM d')}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {filteredTasks.filter(t => t.status === status).length === 0 && (
                        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                          <p className="text-xs text-slate-400 italic">No tasks here</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'team' && (
            <motion.div 
              key="team"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Team Management</h3>
                  <p className="text-sm text-slate-500">Manage trainers and invitations.</p>
                </div>
                <div className="flex gap-2">
                  <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                    <DialogTrigger
                      render={
                        <Button variant="outline" className="border-slate-200 gap-2">
                          <UserPlus className="w-4 h-4" />
                          Invite Trainer
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Invite Trainer</DialogTitle>
                        <DialogDescription>
                          Send an invitation to a new trainer. They will receive an email to join the Vasta dashboard.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="invite-email">Email Address</Label>
                          <Input 
                            id="invite-email" 
                            type="email" 
                            placeholder="trainer@example.com" 
                            value={newInvite.email}
                            onChange={(e) => setNewInvite({ ...newInvite, email: e.target.value })}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invite-role">Assigned Role</Label>
                          <Select 
                            value={newInvite.role} 
                            onValueChange={(val) => setNewInvite({ ...newInvite, role: val as UserRole })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="trainer">Trainer</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="owner">Owner</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="invite-location">Primary Location</Label>
                          <Select 
                            value={newInvite.location} 
                            onValueChange={(val) => setNewInvite({ ...newInvite, location: val as Location })}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                              <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                              <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsInviteOpen(false)}>Cancel</Button>
                        <Button onClick={handleSendInvite} className="bg-red-600 hover:bg-red-700">Send Invitation</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div>
                <h4 className="text-lg font-bold text-slate-900 mb-4">Active Trainers</h4>
                <Card className="border-slate-200">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/50">
                        <TableHead className="w-[250px]">Trainer</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Active Tasks</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trainers.map((trainer) => (
                        <TableRow key={trainer.id} className="hover:bg-slate-50/50 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-3">
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={trainer.photoURL} />
                                <AvatarFallback>{trainer.name[0]}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-bold text-slate-900">{trainer.name}</p>
                                <p className="text-xs text-slate-500 mb-1">ID: {trainer.id}</p>
                                <div className="flex flex-col gap-1 mt-1">
                                  {trainer.birthday && (
                                    <span className="text-[10px] text-pink-600 bg-pink-50 border border-pink-100 rounded px-1.5 py-0.5 flex items-center gap-1 w-fit">
                                      <Cake className="w-3 h-3 text-pink-500" />
                                      Born: {(() => {
                                        try { return new Date(trainer.birthday + 'T00:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'}); } catch { return trainer.birthday; }
                                      })()}
                                    </span>
                                  )}
                                  {trainer.workAnniversary && (
                                    <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5 flex items-center gap-1 w-fit font-semibold">
                                      <Briefcase className="w-3 h-3 text-emerald-500" />
                                      Started: {(() => {
                                        try { return new Date(trainer.workAnniversary + 'T00:00:00').toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'}); } catch { return trainer.workAnniversary; }
                                      })()}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-slate-600">{trainer.email}</TableCell>
                          <TableCell>
                            {trainer.location ? (
                              <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 flex items-center gap-1 w-fit">
                                <MapPin className="w-3 h-3" />
                                {trainer.location}
                              </Badge>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Not set</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`capitalize ${trainer.role === 'admin' || trainer.role === 'owner' ? 'border-red-200 text-red-700 bg-red-50' : 'border-slate-200 text-slate-600'}`}>
                              {trainer.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-red-500" 
                                  style={{ width: `${(tasks.filter(t => (t.assignedTo === trainer.id || (t.assignedToIds && t.assignedToIds.includes(trainer.id))) && t.status !== 'completed').length / 5) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs font-medium text-slate-500">
                                {tasks.filter(t => (t.assignedTo === trainer.id || (t.assignedToIds && t.assignedToIds.includes(trainer.id))) && t.status !== 'completed').length}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {isAdmin && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600">
                                        <Edit2 className="w-4 h-4" />
                                      </Button>
                                    }
                                  />
                                  <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuGroup>
                                      <DropdownMenuLabel>Update Location</DropdownMenuLabel>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, trainer.role, 'Dorset Street')}>Dorset Street</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, trainer.role, 'Shelburne Road')}>Shelburne Road</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, trainer.role, 'West Palm Beach')}>West Palm Beach</DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                      <DropdownMenuLabel>Update Role</DropdownMenuLabel>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, 'trainer', trainer.location || 'Dorset Street')}>Trainer</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, 'admin', trainer.location || 'Dorset Street')}>Admin</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleUpdateTrainerInfo(trainer.id, 'owner', trainer.location || 'Dorset Street')}>Owner</DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem 
                                      className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                      onClick={() => handleRemoveMember(trainer.id)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Remove Member
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-600">
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              </div>

              {invites.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Pending Invitations</h3>
                    <p className="text-sm text-slate-500">Invitations currently waiting for response.</p>
                  </div>
                  <Card className="border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          <TableHead>Recipient</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Sent By</TableHead>
                          <TableHead>Sent At</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invites.map((invite) => (
                          <TableRow key={invite.id}>
                            <TableCell className="font-medium text-slate-900">{invite.email}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1 text-xs text-slate-600">
                                <MapPin className="w-3 h-3 text-red-500" />
                                {invite.location}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize">{invite.role}</Badge>
                            </TableCell>
                            <TableCell className="text-slate-600">{invite.invitedByName}</TableCell>
                            <TableCell className="text-slate-500 text-xs">
                              {format(new Date(invite.sentAt), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-3 items-center">
                                <Badge className="bg-amber-50 text-amber-700 border-amber-100 capitalize">
                                  {invite.status}
                                </Badge>
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      handleRemoveInvite(invite.id);
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'staff' && (
            <motion.div 
              key="staff"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-y-4 md:gap-x-4">
                <Card className="border-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Total Team</p>
                        <h4 className="text-3xl font-bold text-slate-900 mt-1">{trainers.length}</h4>
                      </div>
                      <div className="p-3 bg-red-50 text-red-600 rounded-xl">
                        <Users className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-500">Active Certifications</p>
                        <h4 className="text-3xl font-bold text-slate-900 mt-1">
                          {trainers.reduce((acc, t) => acc + (t.certifications?.filter(c => !c.isInProgress).length || 0), 0)}
                        </h4>
                      </div>
                      <div className="p-3 bg-green-50 text-green-600 rounded-xl">
                        <Award className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-slate-200">
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-medium text-slate-500">In Progress Certs</p>
                        <h4 className="text-3xl font-bold text-slate-900 mt-1">
                          {trainers.reduce((acc, t) => acc + (t.certifications?.filter(c => c.isInProgress).length || 0), 0)}
                        </h4>
                      </div>
                      <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                        <Clock className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Search Control */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row gap-3 shadow-sm justify-between items-center">
                <div className="relative flex-1 w-full">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="Search by trainer name or certification (e.g., CPR, NASM)..." 
                    className="pl-9 border-slate-200 max-w-lg"
                    value={certSearchQuery}
                    onChange={(e) => setCertSearchQuery(e.target.value)}
                  />
                </div>
                <div className="shrink-0 text-xs text-slate-500 font-medium">
                  Showing {trainers.filter(t => {
                    const nameMatches = t.name.toLowerCase().includes(certSearchQuery.toLowerCase());
                    const certMatches = t.certifications?.some(c => c.name.toLowerCase().includes(certSearchQuery.toLowerCase())) || false;
                    return nameMatches || certMatches;
                  }).length} of {trainers.length} staff members
                </div>
              </div>

              {/* Staff and Certifications Accordion List */}
              <div className="space-y-4">
                {trainers
                  .filter(trainer => {
                    const nameMatches = trainer.name.toLowerCase().includes(certSearchQuery.toLowerCase());
                    const certMatches = trainer.certifications?.some(cert => 
                      cert.name.toLowerCase().includes(certSearchQuery.toLowerCase())
                    ) || false;
                    return nameMatches || certMatches;
                  })
                  .map((trainer) => {
                    const isExpanded = expandedTrainerId === trainer.id;
                    const trainerCerts = trainer.certifications || [];
                    const activeCount = trainerCerts.filter(c => !c.isInProgress).length;
                    const pendingCount = trainerCerts.filter(c => c.isInProgress).length;

                    return (
                      <Card key={trainer.id} className="border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all duration-300">
                        {/* Header Area */}
                        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white">
                          <div className="flex items-center gap-4">
                            {/* Clickable Icon/Avatar as requested */}
                            <div 
                              onClick={() => {
                                const nextState = isExpanded ? null : trainer.id;
                                setExpandedTrainerId(nextState);
                                if (nextState) {
                                  setEditBirthday(trainer.birthday || '');
                                  setEditWorkAnniversary(trainer.workAnniversary || '');
                                }
                                setNewCertName('');
                                setNewCertExpiration('');
                                setNewCertRenewal('');
                                setNewCertInProgress(false);
                              }}
                              className="relative cursor-pointer group shrink-0"
                            >
                              <Avatar className="w-16 h-16 ring-2 ring-transparent group-hover:ring-red-500 transition-all duration-300 transform group-hover:scale-105 shadow-md">
                                <AvatarImage src={trainer.photoURL} />
                                <AvatarFallback className="bg-red-50 text-red-700 text-xl font-bold">{trainer.name[0]}</AvatarFallback>
                              </Avatar>
                              <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white p-1 rounded-full text-[10px] opacity-100 transition-opacity duration-200 shadow">
                                <Award className="w-3 h-3" />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-lg text-slate-900">{trainer.name}</h4>
                                <Badge variant="outline" className={`capitalize ${trainer.role === 'admin' || trainer.role === 'owner' ? 'border-red-200 text-red-700 bg-red-50' : 'border-slate-200 text-slate-600'}`}>
                                  {trainer.role}
                                </Badge>
                              </div>
                              <p className="text-sm text-slate-500 flex items-center gap-1">
                                <Mail className="w-3.5 h-3.5" /> {trainer.email}
                              </p>
                              <div className="flex flex-wrap gap-2 pt-1">
                                {trainer.location && (
                                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-50 flex items-center gap-1 text-xs">
                                    <MapPin className="w-3 h-3" />
                                    {trainer.location}
                                  </Badge>
                                )}
                                {trainer.birthday && (
                                  <Badge variant="outline" className="text-pink-600 border-pink-100 flex items-center gap-1 text-xs bg-pink-50/20">
                                    <Cake className="w-3.5 h-3.5 text-pink-500" />
                                    Born: {(() => {
                                      try { return new Date(trainer.birthday + 'T00:00:00').toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'}); } catch { return trainer.birthday; }
                                    })()}
                                  </Badge>
                                )}
                                {trainer.workAnniversary && (
                                  <Badge variant="outline" className="text-emerald-700 border-emerald-100 flex items-center gap-1 text-xs bg-emerald-50/25">
                                    <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                                    Started: {(() => {
                                      try { return new Date(trainer.workAnniversary + 'T00:00:00').toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC'}); } catch { return trainer.workAnniversary; }
                                    })()}
                                  </Badge>
                                )}
                                <Badge variant="outline" className="text-slate-500 flex items-center gap-1 text-xs">
                                  <Award className="w-3 h-3 text-amber-500" />
                                  {activeCount} Cert{activeCount !== 1 ? 's' : ''}
                                </Badge>
                                {pendingCount > 0 && (
                                  <Badge variant="outline" className="text-blue-500 border-blue-200 flex items-center gap-1 text-xs bg-blue-50/35">
                                    <Clock className="w-3 h-3" />
                                    {pendingCount} In Progress
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {canManageCheckIns(user, trainer.id) && (
                              <Button 
                                variant="outline" 
                                onClick={() => {
                                  const alreadyOpen = expandedCheckInTrainerId === trainer.id;
                                  setExpandedCheckInTrainerId(alreadyOpen ? null : trainer.id);
                                  setExpandedTrainerId(null);
                                }}
                                className={`gap-2 border-slate-200 font-medium ${expandedCheckInTrainerId === trainer.id ? 'bg-red-50 text-red-750 border-red-100' : ''}`}
                              >
                                <ClipboardList className="w-4 h-4 text-red-650" />
                                <span>{expandedCheckInTrainerId === trainer.id ? 'Hide Check-Ins' : 'Staff Check-Ins'}</span>
                                {trainer.checkIns && trainer.checkIns.length > 0 && (
                                  <Badge className="bg-red-600 text-white hover:bg-red-700 text-[10px] px-1.5 py-0 h-4 min-w-4 flex items-center justify-center rounded-full">
                                    {trainer.checkIns.length}
                                  </Badge>
                                )}
                              </Button>
                            )}

                            <Button 
                              variant="outline" 
                              onClick={() => {
                                const nextState = isExpanded ? null : trainer.id;
                                setExpandedTrainerId(nextState);
                                if (nextState) {
                                  setEditBirthday(trainer.birthday || '');
                                  setEditWorkAnniversary(trainer.workAnniversary || '');
                                }
                                setExpandedCheckInTrainerId(null);
                                setNewCertName('');
                                setNewCertExpiration('');
                                setNewCertRenewal('');
                                setNewCertInProgress(false);
                                setNewApparelName('');
                                setNewApparelQty('1');
                                setNewApparelSize('M');
                                setNewApparelNotes('');
                              }}
                              className="gap-2 border-slate-200 font-medium"
                            >
                              <span>{isExpanded ? 'Hide Info' : 'Manage Info & Apparel'}</span>
                              <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                            </Button>
                          </div>
                        </div>

                        {/* Collapsible Dropdown Area for Certifications */}
                        <AnimatePresence initial={false}>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="border-t border-slate-100 bg-slate-50/50"
                            >
                              <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* Left Side: List of Certifications */}
                                <div className="lg:col-span-8 space-y-4">
                                  <h5 className="font-bold text-slate-900 flex items-center gap-2">
                                    <Award className="w-4 h-4 text-red-600" />
                                    Earned & Planned Certifications
                                  </h5>

                                  {trainerCerts.length === 0 ? (
                                    <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-white space-y-2">
                                      <p className="text-sm text-slate-500">No certifications logged for {trainer.name}.</p>
                                      {(isAdmin || user.id === trainer.id) && (
                                        <p className="text-xs text-slate-400">Add a certification using the form on the right.</p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="overflow-hidden bg-white border border-slate-200 rounded-xl">
                                      <Table>
                                        <TableHeader>
                                          <TableRow className="bg-slate-50">
                                            <TableHead>Certification Name</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Expiration Date</TableHead>
                                            <TableHead>Renewal Date</TableHead>
                                            <TableHead className="text-right w-[80px]">Actions</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {trainerCerts.map((cert) => {
                                            const status = getCertStatus(cert);
                                            return (
                                              <TableRow key={cert.id} className="hover:bg-slate-50/50">
                                                <TableCell className="font-bold text-slate-900">{cert.name}</TableCell>
                                                <TableCell>
                                                  <Badge variant="outline" className={`${status.color} font-medium`}>
                                                    {status.label}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-500">
                                                  {cert.isInProgress ? (
                                                    cert.expectedCompletionDate ? (
                                                      <span className="text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                                        Expected: {cert.expectedCompletionDate}
                                                      </span>
                                                    ) : (
                                                      <span className="text-slate-400 font-medium">In Progress</span>
                                                    )
                                                  ) : (
                                                    cert.expirationDate || 'N/A'
                                                  )}
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-500">
                                                  {cert.isInProgress ? <span className="text-slate-400">-</span> : (cert.renewalDate || 'N/A')}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                  {(isAdmin || user.id === trainer.id) ? (
                                                    <Button 
                                                      variant="ghost" 
                                                      size="sm" 
                                                      onClick={() => handleRemoveCertification(trainer.id, cert.id)}
                                                      className="text-slate-400 hover:text-red-600 h-8 w-8 p-0"
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                  ) : (
                                                    <span className="text-xs text-slate-400 italic">Auth Only</span>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            );
                                          })}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  )}

                                  {/* Staff Apparel Checklist Section */}
                                  <div className="pt-6 border-t border-slate-200 mt-6 space-y-4">
                                    <div className="flex items-center justify-between">
                                      <h5 className="font-bold text-slate-900 flex items-center gap-2">
                                        <Shirt className="w-4 h-4 text-red-600 shrink-0" />
                                        Staff Apparel & Gear Allocation
                                      </h5>
                                      <span className="text-[11px] text-slate-500 font-medium">Track gear distribution & sizes</span>
                                    </div>

                                    {(!trainer.apparel || trainer.apparel.length === 0) ? (
                                      <div className="border border-dashed border-slate-200 rounded-xl p-8 text-center bg-white space-y-1">
                                        <p className="text-sm text-slate-500 font-semibold">No company apparel registered for this profile.</p>
                                        <p className="text-xs text-slate-400">Add clothing or gear item the staff member owns below.</p>
                                      </div>
                                    ) : (
                                      <div className="overflow-hidden bg-white border border-slate-200 rounded-xl shadow-sm">
                                        <Table>
                                          <TableHeader>
                                            <TableRow className="bg-slate-50 text-slate-700">
                                              <TableHead className="font-semibold text-xs py-2.5">Apparel / Gear Item</TableHead>
                                              <TableHead className="font-semibold text-xs text-center w-[100px] py-2.5">Size</TableHead>
                                              <TableHead className="font-semibold text-xs text-center w-[140px] py-2.5">Quantity</TableHead>
                                              <TableHead className="font-semibold text-xs py-2.5">Notes / Date Allocated</TableHead>
                                              <TableHead className="text-right w-[80px] font-semibold text-xs py-2.5">Action</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {trainer.apparel.map((item) => (
                                              <TableRow key={item.id} className="hover:bg-slate-50/50">
                                                <TableCell className="font-bold text-slate-950 py-3">
                                                  <div className="flex items-center gap-2">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                                    {item.name}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-center py-3">
                                                  <Badge variant="outline" className="font-bold bg-slate-50 border-slate-200 text-slate-700 text-xs px-2 py-0.5">
                                                    {item.size || 'M'}
                                                  </Badge>
                                                </TableCell>
                                                <TableCell className="text-center py-3">
                                                  <div className="flex items-center justify-center gap-2">
                                                    {(isAdmin || user.id === trainer.id) ? (
                                                      <>
                                                        <Button 
                                                          variant="outline" 
                                                          size="sm" 
                                                          onClick={() => handleUpdateApparelQty(trainer.id, item.id, -1)}
                                                          disabled={item.quantity <= 1}
                                                          className="h-7 w-7 p-0 rounded-md border-slate-200 hover:bg-slate-50 bg-white"
                                                        >
                                                          <Minus className="w-3.5 h-3.5 text-slate-600" />
                                                        </Button>
                                                        <span className="font-bold text-sm w-6 text-center text-slate-900">{item.quantity}</span>
                                                        <Button 
                                                          variant="outline" 
                                                          size="sm" 
                                                          onClick={() => handleUpdateApparelQty(trainer.id, item.id, 1)}
                                                          className="h-7 w-7 p-0 rounded-md border-slate-200 hover:bg-slate-50 bg-white"
                                                        >
                                                          <Plus className="w-3.5 h-3.5 text-slate-600" />
                                                        </Button>
                                                      </>
                                                    ) : (
                                                      <span className="font-bold text-sm text-slate-900">{item.quantity}</span>
                                                    )}
                                                  </div>
                                                </TableCell>
                                                <TableCell className="text-sm text-slate-600 py-3">
                                                  {item.notes || <span className="text-slate-300 italic text-xs">None</span>}
                                                </TableCell>
                                                <TableCell className="text-right py-3">
                                                  {(isAdmin || user.id === trainer.id) ? (
                                                    <Button 
                                                      variant="ghost" 
                                                      size="sm" 
                                                      onClick={() => handleRemoveApparel(trainer.id, item.id)}
                                                      className="text-slate-400 hover:text-red-600 h-8 w-8 p-0"
                                                    >
                                                      <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                  ) : (
                                                    <span className="text-xs text-slate-400 italic">Auth Only</span>
                                                  )}
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    )}

                                    {/* Register/Add New Apparel Form */}
                                    {(isAdmin || user.id === trainer.id) && (
                                      <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl space-y-4 shadow-xs">
                                        <div>
                                          <h6 className="font-bold text-slate-900 text-xs uppercase tracking-wider">Record Apparel Item</h6>
                                          <p className="text-[11px] text-slate-500">Add apparel distributed to this team member.</p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                                          {/* Apparel Selection / Name */}
                                          <div className="md:col-span-5 space-y-1.5">
                                            <Label htmlFor={`apparel-select-${trainer.id}`} className="text-xs font-semibold text-slate-700">Apparel Title / Name</Label>
                                            <div className="flex flex-col gap-1.5">
                                              <select 
                                                id={`apparel-select-${trainer.id}`}
                                                className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                                value={staffApparelNames.includes(newApparelName) ? newApparelName : (newApparelName === '' ? 'choose' : 'custom')}
                                                onChange={(e) => {
                                                  const val = e.target.value;
                                                  if (val === 'choose' || val === 'custom') {
                                                    setNewApparelName('');
                                                  } else {
                                                    setNewApparelName(val);
                                                  }
                                                }}
                                              >
                                                <option value="choose">
                                                  {staffApparelNames.length === 0 
                                                    ? "No staff apparel in Catalog..." 
                                                    : "Select apparel item..."}
                                                </option>
                                                {staffApparelNames.map((name) => (
                                                  <option key={name} value={name}>{name}</option>
                                                ))}
                                                <option value="custom">Other / Custom Name...</option>
                                              </select>

                                              <Input 
                                                id={`apparel-custom-${trainer.id}`}
                                                placeholder="Or type custom item name here..." 
                                                value={newApparelName}
                                                onChange={(e) => setNewApparelName(e.target.value)}
                                                className="h-9 border-slate-200 bg-white text-xs"
                                              />
                                              <p className="text-[10px] text-slate-400">
                                                Synced with "Apparel (Staff)" in the Inventory Section.
                                              </p>
                                            </div>
                                          </div>

                                          {/* Size Choice */}
                                          <div className="md:col-span-2 space-y-1.5">
                                            <Label htmlFor={`apparel-size-${trainer.id}`} className="text-xs font-semibold text-slate-700">Size</Label>
                                            <select 
                                              id={`apparel-size-${trainer.id}`}
                                              className="w-full h-9 px-3 rounded-md border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-400"
                                              value={newApparelSize}
                                              onChange={(e) => setNewApparelSize(e.target.value)}
                                            >
                                              <option value="XS">XS</option>
                                              <option value="S">S</option>
                                              <option value="M">M</option>
                                              <option value="L">L</option>
                                              <option value="XL">XL</option>
                                              <option value="XXL">XXL</option>
                                              <option value="3XL">3XL</option>
                                              <option value="One-Size">One-Size</option>
                                            </select>
                                          </div>

                                          {/* Quantity */}
                                          <div className="md:col-span-2 space-y-1.5">
                                            <Label htmlFor={`apparel-qty-${trainer.id}`} className="text-xs font-semibold text-slate-700">Initial Qty</Label>
                                            <Input 
                                              id={`apparel-qty-${trainer.id}`}
                                              type="number"
                                              min="1"
                                              value={newApparelQty}
                                              onChange={(e) => setNewApparelQty(e.target.value)}
                                              className="h-9 border-slate-200 bg-white text-xs text-center"
                                            />
                                          </div>

                                          {/* Allocation Note */}
                                          <div className="md:col-span-3 space-y-1.5">
                                            <Label htmlFor={`apparel-notes-${trainer.id}`} className="text-xs font-semibold text-slate-700">Notes / Date Allocated</Label>
                                            <Input 
                                              id={`apparel-notes-${trainer.id}`}
                                              placeholder="e.g., Issued on hire" 
                                              value={newApparelNotes}
                                              onChange={(e) => setNewApparelNotes(e.target.value)}
                                              className="h-9 border-slate-200 bg-white text-xs"
                                            />
                                          </div>
                                        </div>

                                        <div className="flex justify-end pt-1">
                                          <Button 
                                            onClick={() => {
                                              const qty = parseInt(newApparelQty, 10) || 1;
                                              handleAddApparel(trainer.id, newApparelName, qty, newApparelSize, newApparelNotes);
                                              setNewApparelName('');
                                              setNewApparelQty('1');
                                              setNewApparelSize('M');
                                              setNewApparelNotes('');
                                            }}
                                            className="bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs h-9 px-4 rounded-md flex items-center gap-1.5 shadow-sm"
                                          >
                                            <Shirt className="w-3.5 h-3.5" />
                                            Record Apparel
                                          </Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Right Side: Forms and Side Panels */}
                                <div className="lg:col-span-4 space-y-6">
                                  {/* Add New Certification Form */}
                                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                    <div>
                                      <h5 className="font-bold text-slate-900 mb-1">Add New Certification</h5>
                                      <p className="text-xs text-slate-500 mb-4">Log active or planned qualifications.</p>
                                      
                                      {(isAdmin || user.id === trainer.id) ? (
                                        <div className="space-y-4">
                                          <div className="space-y-1.5">
                                            <Label htmlFor="cert-name" className="text-xs font-semibold text-slate-700">Certification Name</Label>
                                            <Input 
                                              id="cert-name" 
                                              placeholder="e.g., CPR/AED, NASM CPT" 
                                              value={newCertName}
                                              onChange={(e) => setNewCertName(e.target.value)}
                                              className="h-9 border-slate-200"
                                            />
                                          </div>

                                          <div className="flex items-center space-x-2 pt-1 pb-1">
                                            <Checkbox 
                                              id="cert-progress" 
                                              checked={newCertInProgress}
                                              onCheckedChange={(checked) => {
                                                 setNewCertInProgress(!!checked);
                                                 if (!checked) setNewCertExpectedCompletion('');
                                               }}
                                            />
                                            <Label htmlFor="cert-progress" className="text-xs font-medium text-slate-700 cursor-pointer select-none">
                                              Currently in progress/working on
                                            </Label>
                                          </div>

                                          {newCertInProgress && (
                                             <motion.div 
                                               initial={{ opacity: 0, height: 0 }}
                                               animate={{ opacity: 1, height: 'auto' }}
                                               exit={{ opacity: 0, height: 0 }}
                                               transition={{ duration: 0.2 }}
                                               className="space-y-1.5 p-3 rounded-lg border border-amber-100 bg-amber-50/30 mb-3"
                                             >
                                               <Label htmlFor="cert-expected" className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                                                 <Clock className="w-3.5 h-3.5 text-amber-500 animate-pulse" /> Expected Completion Date
                                               </Label>
                                               <Input 
                                                 id="cert-expected" 
                                                 type="date"
                                                 value={newCertExpectedCompletion}
                                                 onChange={(e) => setNewCertExpectedCompletion(e.target.value)}
                                                 className="h-9 border-amber-200 bg-white text-xs text-slate-800 focus-visible:ring-amber-500"
                                               />
                                             </motion.div>
                                           )}

                                           {!newCertInProgress && (
                                            <div className="grid grid-cols-2 gap-3">
                                              <div className="space-y-1.5">
                                                <Label htmlFor="cert-exp" className="text-xs font-semibold text-slate-700">Expiration Date</Label>
                                                <Input 
                                                  id="cert-exp" 
                                                  type="date"
                                                  value={newCertExpiration}
                                                  onChange={(e) => setNewCertExpiration(e.target.value)}
                                                  className="h-9 border-slate-200 text-xs"
                                                />
                                              </div>
                                              <div className="space-y-1.5">
                                                <Label htmlFor="cert-renew" className="text-xs font-semibold text-slate-700">Renewal Date</Label>
                                                <Input 
                                                  id="cert-renew" 
                                                  type="date"
                                                  value={newCertRenewal}
                                                  onChange={(e) => setNewCertRenewal(e.target.value)}
                                                  className="h-9 border-slate-200 text-xs"
                                                />
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="bg-slate-50 border border-slate-200 p-4 rounded-lg text-center">
                                          <p className="text-xs font-medium text-slate-500">Only {trainer.name} or an Admin can manage their certifications.</p>
                                        </div>
                                      )}
                                    </div>

                                    {(isAdmin || user.id === trainer.id) && (
                                      <div className="pt-4 border-t border-slate-100 mt-4">
                                        <Button 
                                          className="w-full bg-red-600 hover:bg-red-700 h-9 text-xs font-medium text-white shadow-sm"
                                          onClick={() => {
                                            handleAddCertification(trainer.id, newCertName, newCertExpiration, newCertRenewal, newCertInProgress, newCertExpectedCompletion);
                                            setNewCertName('');
                                            setNewCertExpiration('');
                                            setNewCertRenewal('');
                                            setNewCertInProgress(false);
                                            setNewCertExpectedCompletion('');
                                          }}
                                        >
                                          Add to Profile
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Staff Dates Form (Birthday and Work Anniversary) */}
                                  {(isAdmin || user.id === trainer.id) ? (
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                      <h5 className="font-bold text-slate-900 mb-1 flex items-center gap-1.5 text-sm">
                                        <Cake className="w-4 h-4 text-pink-500" />
                                        Staff Profile Dates
                                      </h5>
                                      <p className="text-xs text-slate-500 mb-4">Manage key dates for this staff member.</p>
                                      
                                      <div className="space-y-4">
                                        <div className="space-y-1.5">
                                          <Label htmlFor={`birthday-${trainer.id}`} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                            <Cake className="w-3.5 h-3.5 text-pink-500" />
                                            Birthday
                                          </Label>
                                          <Input
                                            id={`birthday-${trainer.id}`}
                                            type="date"
                                            value={editBirthday}
                                            onChange={(e) => setEditBirthday(e.target.value)}
                                            className="h-9 border-slate-200 text-xs"
                                          />
                                        </div>

                                        <div className="space-y-1.5">
                                          <Label htmlFor={`anniversary-${trainer.id}`} className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                                            <Briefcase className="w-3.5 h-3.5 text-emerald-500" />
                                            Work Anniversary
                                          </Label>
                                          <Input
                                            id={`anniversary-${trainer.id}`}
                                            type="date"
                                            value={editWorkAnniversary}
                                            onChange={(e) => setEditWorkAnniversary(e.target.value)}
                                            className="h-9 border-slate-200 text-xs"
                                          />
                                        </div>

                                        <Button
                                          className="w-full bg-slate-900 hover:bg-slate-800 h-9 text-xs font-medium text-white shadow-sm mt-2"
                                          onClick={() => {
                                            handleUpdateTrainerDates(trainer.id, editBirthday, editWorkAnniversary);
                                          }}
                                        >
                                          Save Staff Dates
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-center">
                                      <h5 className="font-bold text-slate-900 mb-1 flex items-center justify-center gap-1.5 text-sm">
                                        <Cake className="w-4 h-4 text-slate-400" />
                                        Staff Dates
                                      </h5>
                                      <div className="space-y-2.5 mt-3 text-left">
                                        <div className="flex justify-between items-center text-xs border-b pb-1.5">
                                          <span className="text-slate-500">Birthday:</span>
                                          <span className="font-semibold text-slate-800">
                                            {trainer.birthday ? (
                                              new Date(trainer.birthday + 'T00:00:00').toLocaleDateString(undefined, {month: 'long', day: 'numeric', timeZone: 'UTC'})
                                            ) : (
                                              'Not set'
                                            )}
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                          <span className="text-slate-500">Work Anniversary:</span>
                                          <span className="font-semibold text-slate-800">
                                            {trainer.workAnniversary ? (
                                              new Date(trainer.workAnniversary + 'T00:00:00').toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC'})
                                            ) : (
                                              'Not set'
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* Collapsible Dropdown Area for Staff Check-Ins */}
                        <AnimatePresence initial={false}>
                          {(expandedCheckInTrainerId === trainer.id && canManageCheckIns(user, trainer.id)) && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: 'easeInOut' }}
                              className="border-t border-slate-100 bg-red-50/5"
                            >
                              <TrainerCheckInPanel 
                                trainer={trainer}
                                user={user}
                                onAddCheckIn={handleAddCheckIn}
                                onRemoveCheckIn={handleRemoveCheckIn}
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    );
                  })}
              </div>
            </motion.div>
          )}

          {activeTab === 'vacations' && (
            <Tabs defaultValue="calendar" className="w-full">
              <motion.div 
                key="vacations"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex-shrink-0">
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">Staff Schedule & Vacations</h3>
                    <p className="text-[11px] text-slate-500">Manage time-off requests for your team.</p>
                  </div>

                  <TabsList className="bg-slate-50 border border-slate-100 p-0.5 rounded-lg w-full md:w-auto">
                    <TabsTrigger value="calendar" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <CalendarDays className="w-3 h-3" />
                      Calendar
                    </TabsTrigger>
                    <TabsTrigger value="requests" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Clock className="w-3 h-3" />
                      Requests
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex gap-2 flex-shrink-0">
                    <Dialog open={isNewVacationOpen} onOpenChange={(open) => {
                    setIsNewVacationOpen(open);
                      if (open) {
                      if (!editingVacationId && user) {
                        setNewVacation(prev => ({ ...prev, userId: user.id }));
                      }
                    } else {
                      setEditingVacationId(null);
                      setNewVacation({ 
                        userId: '', 
                        startDate: new Date().toISOString().split('T')[0], 
                        endDate: new Date().toISOString().split('T')[0], 
                        type: 'vacation', 
                        hours: 8,
                        notes: '' 
                      });
                    }
                  }}>
                    <DialogTrigger
                      render={
                        <Button className="bg-red-600 hover:bg-red-700 gap-2">
                          <Plus className="w-4 h-4" />
                          Add Vacation
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingVacationId ? 'Edit Vacation Request' : 'Log Vacation Request'}</DialogTitle>
                        <DialogDescription>
                          {editingVacationId ? 'Modify the existing time-off request details.' : 'Submit a new time-off request for a staff member.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label>Team Member</Label>
                          <Select 
                            value={newVacation.userId} 
                            onValueChange={val => setNewVacation({...newVacation, userId: val})}
                            disabled={!!editingVacationId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select member..." />
                            </SelectTrigger>
                            <SelectContent>
                              {trainers.map(s => (
                                <SelectItem key={s.id} value={s.id}>
                                  <div className="flex items-center justify-between w-full min-w-[200px]">
                                    <span>{s.name}</span>
                                    <span className="text-[10px] text-slate-400 font-normal ml-2">({s.location})</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Start Date</Label>
                            <Input 
                              type="date" 
                              value={newVacation.startDate} 
                              onChange={e => setNewVacation({...newVacation, startDate: e.target.value})}
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>End Date</Label>
                            <Input 
                              type="date" 
                              value={newVacation.endDate} 
                              onChange={e => setNewVacation({...newVacation, endDate: e.target.value})}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label>Type</Label>
                            <Select 
                              value={newVacation.type} 
                              onValueChange={val => setNewVacation({...newVacation, type: val as any})}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="vacation">Vacation</SelectItem>
                                <SelectItem value="sick">Sick Leave</SelectItem>
                                <SelectItem value="personal">Personal Leave</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2">
                            <Label>Hours Effected</Label>
                            <Input 
                              type="number"
                              min="0"
                              max="24"
                              step="0.5"
                              value={isNaN(newVacation.hours) ? '' : newVacation.hours} 
                              onChange={e => {
                                const val = parseFloat(e.target.value);
                                setNewVacation({...newVacation, hours: isNaN(val) ? 0 : val});
                              }}
                            />
                          </div>
                        </div>
                        <div className="grid gap-2">
                          <Label>Notes (Optional)</Label>
                          <Textarea 
                            placeholder="Add any specific details..." 
                            value={newVacation.notes}
                            onChange={e => setNewVacation({...newVacation, notes: e.target.value})}
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button onClick={handleCreateVacation} className="w-full bg-red-600 hover:bg-red-700">
                          {editingVacationId ? 'Update Request' : 'Submit Request'}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <TabsContent value="calendar" className="mt-0">
                  <Card className="border-slate-200 overflow-hidden bg-white shadow-md">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 py-4">
                      <div className="flex items-center gap-4">
                        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                          Prev
                        </Button>
                        <h4 className="text-lg font-bold text-slate-900 min-w-[150px] text-center">
                          {format(currentMonth, 'MMMM yyyy')}
                        </h4>
                        <Button variant="outline" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                          Next
                        </Button>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(new Date())} className="text-xs hover:text-red-600">
                        Today
                      </Button>
                    </CardHeader>
                    <CardContent className="p-0">
                      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/30">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                          <div key={day} className="py-3 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {day}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 border-l border-t border-slate-100 bg-white">
                        {Array.from({ length: getDay(startOfMonth(currentMonth)) }).map((_, i) => (
                          <div key={`empty-${i}`} className="h-32 border-r border-b border-slate-100 bg-slate-50/20" />
                        ))}
                        {eachDayOfInterval({
                          start: startOfMonth(currentMonth),
                          end: endOfMonth(currentMonth)
                        }).map(day => {
                          const dayVacations = getVacationsForDay(day);
                          return (
                            <div key={day.toString()} className={`h-32 border-r border-b border-slate-100 p-2 transition-colors hover:bg-slate-50/50 relative group ${isSameDay(day, new Date()) ? 'bg-red-50/30' : ''}`}>
                              <span className={`text-xs font-bold ${isSameDay(day, new Date()) ? 'text-red-600' : 'text-slate-400'}`}>
                                {format(day, 'd')}
                              </span>
                                <div className="mt-2 space-y-1">
                                  {dayVacations.slice(0, 3).map(v => (
                                    <div 
                                      key={v.id} 
                                      className={`text-[9px] px-1.5 py-0.5 rounded border truncate cursor-pointer transition-transform hover:scale-105 ${
                                        v.status === 'approved' 
                                          ? 'bg-green-50 text-green-700 border-green-100' 
                                          : v.status === 'rejected'
                                          ? 'bg-red-50 text-red-700 border-red-100'
                                          : 'bg-amber-50 text-amber-700 border-amber-100'
                                      }`}
                                      title={`${v.userName} (${v.type})${v.hours ? ` - ${v.hours}hrs` : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditVacation(v);
                                      }}
                                    >
                                      {v.userName} {v.hours && <span className="opacity-60 text-[8px]">({v.hours}h)</span>}
                                    </div>
                                  ))}
                                {dayVacations.length > 3 && (
                                  <div className="text-[9px] text-slate-400 font-medium pl-1 italic">
                                    + {dayVacations.length - 3} more
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="requests" className="mt-0">
                  <Card className="border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          <TableHead>Team Member</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vacations.map(vacation => (
                          <TableRow key={vacation.id} className="hover:bg-slate-50/50 transition-colors">
                            <TableCell className="font-bold text-slate-900">
                              <div>
                                {vacation.userName}
                                {vacation.hours && <p className="text-[10px] font-normal text-slate-400">{vacation.hours} hrs/day</p>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-[10px]">{vacation.type}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 font-medium">
                              {format(parseISO(vacation.startDate), 'MMM d')} - {format(parseISO(vacation.endDate), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell className="text-xs font-bold text-slate-500">{vacation.totalDays}d</TableCell>
                            <TableCell>
                              <Badge className={`capitalize text-[10px] ${
                                vacation.status === 'approved' ? 'bg-green-50 text-green-700 border-green-200' :
                                vacation.status === 'rejected' ? 'bg-red-50 text-red-700 border-red-200' :
                                'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {vacation.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-slate-400 hover:text-blue-600"
                                    onClick={() => handleEditVacation(vacation)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {isAdmin && vacation.status === 'pending' && (
                                  <>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-green-600 hover:bg-green-50"
                                      onClick={() => handleUpdateVacationStatus(vacation.id, 'approved')}
                                    >
                                      Approve
                                    </Button>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="text-red-500 hover:bg-red-50"
                                      onClick={() => handleUpdateVacationStatus(vacation.id, 'rejected')}
                                    >
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-slate-400 hover:text-red-600"
                                    onClick={() => handleRemoveVacation(vacation.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                        {vacations.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-12 text-slate-400 italic text-sm">
                              No vacation requests found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>
              </motion.div>
            </Tabs>
          )}

          {activeTab === 'inventory' && (
            <Tabs defaultValue="equipment" className="w-full">
              <motion.div 
                key="inventory"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center gap-4">
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 leading-tight">Catalog & Stock</h3>
                      <p className="text-[11px] text-slate-500">Manage facility supplies and retail items.</p>
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 hidden md:block" />
                    <Select 
                      value={inventoryLocationFilter} 
                      onValueChange={(val) => setInventoryLocationFilter(val as Location | 'All')}
                    >
                      <SelectTrigger className="w-[160px] h-8 text-[11px] font-medium border-slate-200 gap-2">
                        <MapPin className="w-3 h-3 text-red-600" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Locations</SelectItem>
                        <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                        <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                        <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <TabsList className="bg-slate-50 border border-slate-100 p-0.5 rounded-lg w-full md:w-auto overflow-x-auto flex-nowrap">
                    <TabsTrigger value="equipment" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Dumbbell className="w-3 h-3" />
                      Equipment
                    </TabsTrigger>
                    <TabsTrigger value="retail-equipment" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <ShoppingCart className="w-3 h-3" />
                      Equipment (Sale)
                    </TabsTrigger>
                    <TabsTrigger value="retail-food-drink" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Coffee className="w-3 h-3" />
                      Food & Drink
                    </TabsTrigger>
                    <TabsTrigger value="retail-apparel" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Shirt className="w-3 h-3" />
                      Retail Apparel
                    </TabsTrigger>
                    <TabsTrigger value="staff-apparel" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Tag className="w-3 h-3" />
                      Staff Apparel
                    </TabsTrigger>
                    <TabsTrigger value="history" className="rounded-md py-1 px-3 text-[10px] gap-1.5 h-7">
                      <Clock className="w-3 h-3" />
                      Audit History
                    </TabsTrigger>
                  </TabsList>
                </div>

                {(['equipment', 'retail-equipment', 'retail-food-drink', 'retail-apparel', 'staff-apparel'] as InventoryCategory[]).map(category => (
                  <TabsContent key={category} value={category} className="mt-0">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {inventoryItems.filter(item => 
                        item.category === category && 
                        (inventoryLocationFilter === 'All' || item.location === inventoryLocationFilter)
                      ).map(item => (
                        <Card key={item.id} className="group relative overflow-hidden border-slate-200 hover:shadow-md transition-all duration-200 bg-white">
                          <CardHeader className="p-4 bg-slate-50/50 border-b border-slate-100">
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0">
                                <CardTitle className="text-sm font-bold truncate text-slate-900">{item.name}</CardTitle>
                                <div className="flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-2.5 h-2.5 text-slate-400" />
                                  <span className="text-[9px] text-slate-500 font-medium">{item.location}</span>
                                </div>
                              </div>
                              <div className="flex gap-1 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {(isAdmin || user?.role === 'trainer') && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditInventoryItem(item);
                                    }}
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                )}
                                {isAdmin && (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleRemoveInventoryItem(item.id);
                                    }}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-500 font-medium">Stock Level</span>
                              <Badge 
                                variant={item.quantity > 5 ? 'secondary' : item.quantity > 0 ? 'outline' : 'destructive'}
                                className="text-[10px] font-bold h-5"
                              >
                                {item.quantity} in stock
                              </Badge>
                            </div>
                            {item.price !== undefined && item.price > 0 && item.category !== 'staff-apparel' && item.category !== 'equipment' && (
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500 font-medium">Retail Price</span>
                                <span className="font-bold text-slate-900">${item.price.toFixed(2)}</span>
                              </div>
                            )}
                            {item.productLink && (
                              <a 
                                href={item.productLink} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-red-600 hover:text-red-700 transition-colors pt-1"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Product Page
                              </a>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                      {inventoryItems.filter(item => item.category === category).length === 0 && (
                        <div className="col-span-full py-16 text-center bg-slate-50/30 rounded-3xl border-2 border-dashed border-slate-100">
                          <Package className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm text-slate-400 italic">No {category.replace(/-/g, ' ')} items listed.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ))}

                <TabsContent value="history" className="mt-0">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="text-[10px] uppercase font-bold text-slate-500">Date</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-slate-500">Location</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-slate-500">Reported By</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-slate-500">Items Counted</TableHead>
                          <TableHead className="text-[10px] uppercase font-bold text-slate-500">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventoryReports
                          .filter(report => inventoryLocationFilter === 'All' || report.location === inventoryLocationFilter)
                          .map((report) => (
                          <TableRow key={report.id} className="hover:bg-slate-50/50">
                            <TableCell className="text-xs font-semibold text-slate-700">
                              {format(parseISO(report.reportedAt), 'MMM d, yyyy HH:mm')}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <MapPin className="w-3 h-3 text-red-600" />
                                <span className="text-xs font-medium text-slate-600">{report.location}</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-slate-600">{report.reportedByName}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-900">{report.items.length} items</TableCell>
                            <TableCell className="text-xs text-slate-400 italic max-w-[200px] truncate">{report.notes || 'No notes'}</TableCell>
                          </TableRow>
                        ))}
                        {inventoryReports.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="py-12 text-center text-slate-400 h-24">
                              No inventory reports found.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </motion.div>
            </Tabs>
          )}

          {activeTab === 'resources' && (
            <motion.div 
              key="resources"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Resources Sub-tabs Switcher */}
              <div className="flex border-b border-slate-200 pb-px mb-6">
                <button
                  onClick={() => setResourcesSubTab('links')}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                    resourcesSubTab === 'links' 
                      ? 'border-red-600 text-red-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Link className="w-4 h-4" />
                  Resource Links
                </button>
                <button
                  onClick={() => setResourcesSubTab('calendar')}
                  className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
                    resourcesSubTab === 'calendar' 
                      ? 'border-red-600 text-red-600' 
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <CalendarDays className="w-4 h-4" />
                  Staff Events Calendar
                </button>
              </div>

              {resourcesSubTab === 'links' ? (
                <>
                  <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input 
                        placeholder="Search resources..." 
                        className="pl-10 border-none bg-transparent focus-visible:ring-0"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {resources
                      .filter(res => 
                        res.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        res.category?.toLowerCase().includes(searchQuery.toLowerCase())
                      )
                      .map(resource => (
                        <Card key={resource.id} className="group hover:shadow-lg transition-all duration-300 border-slate-200 bg-white overflow-hidden flex flex-col">
                          <div className="h-2 bg-red-600" />
                          <CardHeader className="p-5 pb-2">
                            <div className="flex justify-between items-start mb-2">
                              <Badge variant="outline" className="text-[10px] uppercase font-bold border-red-100 text-red-600 bg-red-50/50">
                                {resource.category || 'General'}
                              </Badge>
                              {isAdmin && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-7 w-7 p-0 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleDeleteResource(resource.id)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                            <CardTitle className="text-lg font-bold text-slate-900 group-hover:text-red-700 transition-colors line-clamp-2 min-h-[3.5rem] flex items-center">
                              {resource.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-5 pt-0 flex-1 flex flex-col justify-end">
                            <div className="flex flex-col gap-4 mt-4">
                              <div className="flex items-center gap-2 text-slate-400 text-[10px] font-medium">
                                <Clock className="w-3 h-3" />
                                <span>Added {format(parseISO(resource.createdAt), 'MMM d, yyyy')}</span>
                              </div>
                              <a 
                                href={resource.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="w-full inline-flex items-center justify-center gap-2 bg-slate-900 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-slate-800 transition-all shadow-md active:scale-95"
                              >
                                <ExternalLink className="w-4 h-4" />
                                Open Document
                              </a>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    {resources.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-slate-100 shadow-sm">
                        <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <h4 className="text-lg font-bold text-slate-400">No Resources Yet</h4>
                        <p className="text-slate-400 text-sm max-w-xs mx-auto mt-1">
                          Start adding frequently used Google Docs, spreadsheets, or important links for your team.
                        </p>
                        {isAdmin && (
                          <Button 
                            onClick={() => setIsNewResourceOpen(true)}
                            variant="link" 
                            className="mt-4 text-red-600 hover:text-red-700"
                          >
                            Add your first resource
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                /* Calendar View */
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  {/* Calendar Month Grid */}
                  <div className="lg:col-span-2 space-y-4">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-bold text-slate-900 capitalize font-sans">
                          {format(currentCalendarMonth, 'MMMM yyyy')}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                          onClick={() => setCurrentCalendarMonth(prev => subMonths(prev, 1))}
                        >
                          <ChevronRight className="w-4 h-4 rotate-180" />
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="h-8 px-3 border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900"
                          onClick={() => setCurrentCalendarMonth(new Date())}
                        >
                          Today
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900"
                          onClick={() => setCurrentCalendarMonth(prev => addMonths(prev, 1))}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Calendar Grid Box */}
                    <Card id="staff-calendar-grid-card" className="border-slate-200 bg-white shadow-sm overflow-hidden p-4">
                      <div className="grid grid-cols-7 gap-1 text-center mb-2">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                          <div key={i} className="text-xs font-bold text-slate-400 py-1 uppercase tracking-wider font-mono">
                            {d}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-7 gap-2">
                        {/* Empty slots for month start padding */}
                        {Array.from({ length: getDay(startOfMonth(currentCalendarMonth)) }).map((_, i) => (
                          <div key={`empty-${i}`} className="min-h-[85px] rounded-lg bg-slate-50/50 border border-transparent" />
                        ))}

                        {/* Days of month */}
                        {eachDayOfInterval({ 
                          start: startOfMonth(currentCalendarMonth), 
                          end: endOfMonth(currentCalendarMonth) 
                        }).map((day, idx) => {
                          const isToday = isSameDay(day, new Date());
                          const isSelected = selectedCalendarDay && isSameDay(day, selectedCalendarDay);
                          
                          // Get events
                          const dayEvts = staffEvents.filter(e => {
                            try {
                              return isSameDay(parseISO(e.date), day);
                            } catch {
                              return e.date === format(day, 'yyyy-MM-dd');
                            }
                          });

                          const dayBdays = trainers.filter(t => {
                            if (!t.birthday) return false;
                            try {
                              const parts = t.birthday.split('-');
                              if (parts.length >= 2) {
                                const bMonth = parseInt(parts[1], 10);
                                const bDay = parseInt(parts[2] || parts[1], 10);
                                const actualMonth = parts.length === 2 ? parseInt(parts[0], 10) : bMonth;
                                const actualDay = parts.length === 2 ? bDay : parseInt(parts[2], 10);
                                return actualMonth === (day.getMonth() + 1) && actualDay === day.getDate();
                              }
                            } catch {}
                            return false;
                          });

                          const dayAnns = trainers.filter(t => {
                            if (!t.workAnniversary) return false;
                            try {
                              const parts = t.workAnniversary.split('-');
                              if (parts.length >= 2) {
                                const aMonth = parseInt(parts[1], 10);
                                const aDay = parseInt(parts[2] || parts[1], 10);
                                const actualMonth = parts.length === 2 ? parseInt(parts[0], 10) : aMonth;
                                const actualDay = parts.length === 2 ? aDay : parseInt(parts[2], 10);
                                return actualMonth === (day.getMonth() + 1) && actualDay === day.getDate();
                              }
                            } catch {}
                            return false;
                          });

                          const totalCount = dayEvts.length + dayBdays.length + dayAnns.length;

                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedCalendarDay(day)}
                              className={`min-h-[85px] p-1.5 rounded-xl border flex flex-col justify-between text-left transition-all relative ${
                                isToday 
                                  ? 'bg-red-50/40 border-red-200 text-red-950 ring-1 ring-red-100/50' 
                                  : isSelected
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-md'
                                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                              }`}
                            >
                              <span className={`text-xs font-bold font-mono h-5 w-5 rounded-full flex items-center justify-center ${
                                isToday && !isSelected
                                  ? 'bg-red-600 text-white font-black' 
                                  : isSelected 
                                    ? 'text-white'
                                    : 'text-slate-700'
                              }`}>
                                {format(day, 'd')}
                              </span>

                              {/* Event Badges */}
                              <div className="mt-1 space-y-1 overflow-hidden w-full">
                                {dayEvts.slice(0, 1).map((e, eIdx) => (
                                  <div 
                                    key={eIdx} 
                                    className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate border ${
                                      isSelected 
                                        ? 'bg-white/10 border-white/20 text-white' 
                                        : e.type === 'outing'
                                          ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                          : e.type === 'meeting'
                                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                                            : 'bg-slate-100 border-slate-200 text-slate-700'
                                    }`}
                                  >
                                    {e.title}
                                  </div>
                                ))}
                                {dayBdays.slice(0, 1).map((t, bIdx) => (
                                  <div 
                                    key={bIdx} 
                                    className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate border flex items-center gap-0.5 ${
                                      isSelected 
                                        ? 'bg-pink-950/40 border-pink-800/40 text-pink-100' 
                                        : 'bg-pink-50 border-pink-100 text-pink-700'
                                    }`}
                                  >
                                    <Cake className="w-2.5 h-2.5 shrink-0" />
                                    {t.name}
                                  </div>
                                ))}
                                {dayAnns.slice(0, 1).map((t, aIdx) => (
                                  <div 
                                    key={aIdx} 
                                    className={`text-[9px] font-semibold px-1 py-0.5 rounded truncate border flex items-center gap-0.5 ${
                                      isSelected 
                                        ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-100' 
                                        : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                                    }`}
                                  >
                                    <Briefcase className="w-2.5 h-2.5 shrink-0" />
                                    {t.name}
                                  </div>
                                ))}
                                {totalCount > 3 && (
                                  <div className={`text-[8px] font-bold pl-1 ${isSelected ? 'text-white/60' : 'text-slate-400'}`}>
                                    +{totalCount - 3} more
                                  </div>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </Card>
                  </div>

                  {/* Day Details Panel */}
                  <div className="lg:col-span-1">
                    {(() => {
                      const targetDay = selectedCalendarDay || new Date();
                      
                      // Get events
                      const dayEvts = staffEvents.filter(e => {
                        try {
                          return isSameDay(parseISO(e.date), targetDay);
                        } catch {
                          return e.date === format(targetDay, 'yyyy-MM-dd');
                        }
                      });

                      const dayBdays = trainers.filter(t => {
                        if (!t.birthday) return false;
                        try {
                          const parts = t.birthday.split('-');
                          if (parts.length >= 2) {
                            const bMonth = parseInt(parts[1], 10);
                            const bDay = parseInt(parts[2] || parts[1], 10);
                            const actualMonth = parts.length === 2 ? parseInt(parts[0], 10) : bMonth;
                            const actualDay = parts.length === 2 ? bDay : parseInt(parts[2], 10);
                            return actualMonth === (targetDay.getMonth() + 1) && actualDay === targetDay.getDate();
                          }
                        } catch {}
                        return false;
                      });

                      const dayAnns = trainers.filter(t => {
                        if (!t.workAnniversary) return false;
                        try {
                          const parts = t.workAnniversary.split('-');
                          if (parts.length >= 2) {
                            const aMonth = parseInt(parts[1], 10);
                            const aDay = parseInt(parts[2] || parts[1], 10);
                            const actualMonth = parts.length === 2 ? parseInt(parts[0], 10) : aMonth;
                            const actualDay = parts.length === 2 ? aDay : parseInt(parts[2], 10);
                            return actualMonth === (targetDay.getMonth() + 1) && actualDay === targetDay.getDate();
                          }
                        } catch {}
                        return false;
                      });

                      const getAnniversaryYears = (trainer: Trainer) => {
                        if (!trainer.workAnniversary) return null;
                        try {
                          const parts = trainer.workAnniversary.split('-');
                          if (parts.length === 3) {
                            const startYear = parseInt(parts[0], 10);
                            const currentYear = targetDay.getFullYear();
                            const years = currentYear - startYear;
                            return years > 0 ? `${years} yr` : '1st';
                          }
                        } catch {}
                        return 'Anniversary';
                      };

                      const hasAny = dayEvts.length > 0 || dayBdays.length > 0 || dayAnns.length > 0;

                      return (
                        <Card id="staff-calendar-detail-card" className="border-slate-200 bg-white shadow-sm sticky top-24">
                          <CardHeader className="bg-slate-50 border-b border-slate-200 p-5">
                            <CardTitle className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider flex items-center justify-between">
                              <span>Day Details</span>
                              <span className="font-mono text-xs text-slate-500 font-semibold">{format(targetDay, 'MMM d, yyyy')}</span>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-5 space-y-6">
                            {/* Birthdays section */}
                            {dayBdays.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-pink-600 uppercase tracking-widest font-mono flex items-center gap-1">
                                  <Cake className="w-3.5 h-3.5" /> Staff Birthdays
                                </h4>
                                <div className="space-y-2">
                                  {dayBdays.map((trainer, bIdx) => (
                                    <div key={bIdx} className="flex items-center gap-3 bg-pink-50/40 border border-pink-100 p-3 rounded-xl">
                                      <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
                                        <AvatarImage src={trainer.photoURL || `https://picsum.photos/seed/${trainer.email}/100/100`} />
                                        <AvatarFallback>{trainer.name[0]}</AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="text-xs font-bold text-slate-900 font-sans">🎉 Happy Birthday, {trainer.name}!</p>
                                        <p className="text-[10px] text-pink-600 font-medium">Coach at {trainer.location || 'Dorset Street'}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Anniversaries section */}
                            {dayAnns.length > 0 && (
                              <div className="space-y-2">
                                <h4 className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest font-mono flex items-center gap-1">
                                  <Briefcase className="w-3.5 h-3.5" /> Work Anniversaries
                                </h4>
                                <div className="space-y-2">
                                  {dayAnns.map((trainer, aIdx) => (
                                    <div key={aIdx} className="flex items-center gap-3 bg-emerald-50/40 border border-emerald-100 p-3 rounded-xl">
                                      <Avatar className="w-8 h-8 border-2 border-white shadow-sm">
                                        <AvatarImage src={trainer.photoURL || `https://picsum.photos/seed/${trainer.email}/100/100`} />
                                        <AvatarFallback>{trainer.name[0]}</AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <p className="text-xs font-bold text-slate-900 font-sans">🙌 Happy {getAnniversaryYears(trainer)} Anniversary!</p>
                                        <p className="text-[10px] text-emerald-700 font-medium">Thank you for your service at {trainer.location || 'Dorset Street'}!</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Custom Events section */}
                            {dayEvts.length > 0 && (
                              <div className="space-y-3">
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                                  Staff Events ({dayEvts.length})
                                </h4>
                                <div className="space-y-3">
                                  {dayEvts.map((event, eIdx) => (
                                    <div key={eIdx} className="bg-slate-50/50 border border-slate-200 p-4 rounded-xl space-y-2 relative group/item">
                                      <div className="flex justify-between items-start">
                                        <div>
                                          <Badge className={`text-[9px] font-bold capitalize ${
                                            event.type === 'outing' 
                                              ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                                              : event.type === 'meeting'
                                                ? 'bg-amber-50 border-amber-100 text-amber-700'
                                                : 'bg-slate-100 border-slate-200 text-slate-700'
                                          }`}>
                                            {event.type}
                                          </Badge>
                                          <h5 className="text-sm font-bold text-slate-900 mt-1 font-sans">{event.title}</h5>
                                        </div>
                                        {(isAdmin || user.id === event.createdBy) && (
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-7 w-7 p-0 text-slate-300 hover:text-red-600 hover:bg-slate-100 rounded-lg shrink-0"
                                            onClick={() => handleDeleteStaffEvent(event.id)}
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </Button>
                                        )}
                                      </div>
                                      {event.location && (
                                        <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium">
                                          <MapPin className="w-3 h-3 text-slate-400" />
                                          <span>{event.location}</span>
                                        </div>
                                      )}
                                      {event.description && (
                                        <p className="text-xs text-slate-600 mt-1 whitespace-pre-wrap font-sans">{event.description}</p>
                                      )}
                                      <div className="flex items-center gap-1.5 text-[9px] text-slate-400 pt-1 border-t border-slate-100">
                                        <span>Created by {event.createdByName}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {!hasAny && (
                              <div className="text-center py-8">
                                <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                                <p className="text-xs font-bold text-slate-400 font-sans">No Events Scheduled</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">There are no team outings, staff meetings, birthdays, or anniversaries scheduled on this day.</p>
                                <Button 
                                  onClick={() => {
                                    setNewEvent(prev => ({ ...prev, date: format(targetDay, 'yyyy-MM-dd') }));
                                    setIsNewEventOpen(true);
                                  }}
                                  variant="link" 
                                  className="mt-2 text-xs text-red-600 hover:text-red-700 h-auto p-0 font-semibold"
                                >
                                  + Add Event
                                </Button>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })()}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'marketing' && (
            <motion.div
              key="marketing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="space-y-6"
            >
              <Card id="marketing-embedded-sheet-card" className="border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
                <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-lg">
                      <FileText className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 font-sans">Marketing Spreadsheet</h4>
                      <a 
                        href="https://docs.google.com/spreadsheets/d/1jG8rRkxnL6dHjkxxyPSRWZuR5V5cGBi79DluJEV389o/edit?usp=sharing" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-xs text-red-600 hover:text-red-700 hover:underline flex items-center gap-1 mt-0.5 font-sans"
                      >
                        Open spreadsheet in new window <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
                <div className="relative w-full h-[700px] bg-slate-50">
                  <iframe 
                    src="https://docs.google.com/spreadsheets/d/1jG8rRkxnL6dHjkxxyPSRWZuR5V5cGBi79DluJEV389o/edit?rm=minimal" 
                    className="w-full h-full border-none"
                    title="Marketing Spreadsheet"
                    referrerPolicy="no-referrer"
                    allowFullScreen
                  />
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'onboarding' && (() => {
            const currentCourse = courses.find(c => c.id === activeCourseId) || courses[0];
            const courseChapters = chapters.filter(c => c.courseId === currentCourse?.id).sort((a,b) => a.order - b.order);
            const activeLesson = lessons.find(l => l.id === activeLessonId);
            const totalLessons = lessons.filter(l => l.courseId === currentCourse?.id).length;
            const completedLessons = progressList.filter(p => p.courseId === currentCourse?.id).length;
            const percent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

            const getEmbedUrl = (url: string) => {
              if (!url) return '';
              if (url.includes('/embed/')) return url;
              if (url.includes('youtube.com/watch')) {
                try {
                  const u = new URL(url);
                  const v = u.searchParams.get('v');
                  if (v) return `https://www.youtube.com/embed/${v}`;
                } catch {}
              }
              if (url.includes('youtu.be/')) {
                const parts = url.split('/');
                const v = parts[parts.length - 1];
                if (v) return `https://www.youtube.com/embed/${v.split('?')[0]}`;
              }
              if (url.includes('vimeo.com/')) {
                const parts = url.split('/');
                const id = parts[parts.length - 1];
                if (id) return `https://player.vimeo.com/video/${id.split('?')[0]}`;
              }
              return url;
            };

            const isDirectVideo = (url: string) => {
              if (!url) return false;
              const cleanUrl = url.toLowerCase().split('?')[0];
              return cleanUrl.endsWith('.mp4') || cleanUrl.endsWith('.webm') || cleanUrl.endsWith('.ogg') || cleanUrl.endsWith('.mov');
            };

            const handleNextLesson = () => {
              if (!currentCourse) return;
              const orderedLessons: Lesson[] = [];
              for (const chap of courseChapters) {
                const chapLessons = lessons.filter(l => l.chapterId === chap.id).sort((a,b) => a.order - b.order);
                orderedLessons.push(...chapLessons);
              }
              const currentIndex = orderedLessons.findIndex(l => l.id === activeLessonId);
              if (currentIndex !== -1 && currentIndex < orderedLessons.length - 1) {
                setActiveLessonId(orderedLessons[currentIndex + 1].id);
              } else {
                toast.info("You've reached the end of the course! Great job! 🎉");
              }
            };

            if (courses.length === 0) {
              return (
                <motion.div
                  key="onboarding-empty"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="space-y-6"
                >
                  <Card className="border-slate-200 bg-white p-12 text-center shadow-sm">
                    <div className="max-w-md mx-auto space-y-6">
                      <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto border border-red-100 shadow-sm">
                        <GraduationCap className="w-8 h-8" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-xl font-bold text-slate-900 font-sans">No Onboarding Courses Found</h3>
                        <p className="text-sm text-slate-500 font-sans leading-relaxed">
                          There are no onboarding or training courses created yet. Switch to "Course Builder Mode" in the top bar to create custom chapters, add lessons, and publish your syllabus.
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex justify-center gap-3">
                          <Button onClick={() => setIsNewCourseOpen(true)} className="bg-red-600 hover:bg-red-700 font-semibold text-xs">
                            Create Custom Course
                          </Button>
                        </div>
                      )}
                    </div>
                  </Card>
                  {isAdmin && (
                    <Dialog open={isNewCourseOpen} onOpenChange={setIsNewCourseOpen}>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                          <DialogTitle>Create Custom Course</DialogTitle>
                          <DialogDescription>Add a new coaching or training curriculum for your trainers.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-title">Course Title</Label>
                            <Input 
                              id="course-title"
                              value={newCourse.title}
                              onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                              placeholder="e.g. Front Desk & Reception Training"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-desc">Description</Label>
                            <Textarea 
                              id="course-desc"
                              value={newCourse.description}
                              onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                              placeholder="Describe what the trainers will learn in this course..."
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-category">Category</Label>
                            <Input 
                              id="course-category"
                              value={newCourse.category}
                              onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                              placeholder="e.g. Onboarding, Operations, Certifications"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsNewCourseOpen(false)}>Cancel</Button>
                          <Button onClick={handleCreateCourse} className="bg-red-600 hover:bg-red-700">Create Course</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </motion.div>
              );
            }

            if (!activeCourseId) {
              return (
                <motion.div
                  key="onboarding-catalog"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 bg-white border border-slate-200 rounded-xl shadow-xs">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold text-slate-900 font-sans">Available Onboarding & Training Courses</h3>
                      <p className="text-xs text-slate-500 font-sans">
                        Select a course below to begin your training, view chapters, and track your certification progress.
                      </p>
                    </div>
                    {isOnboardingAdminMode && isAdmin && (
                      <Button onClick={() => setIsNewCourseOpen(true)} className="bg-red-600 hover:bg-red-700 font-semibold text-xs shrink-0">
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Custom Course
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {courses.map((course) => {
                      const courseChapters = chapters.filter(c => c.courseId === course.id).sort((a,b) => a.order - b.order);
                      const courseLessons = lessons.filter(l => l.courseId === course.id).sort((a,b) => a.order - b.order);
                      const totalLessons = courseLessons.length;
                      const completedLessons = progressList.filter(p => p.courseId === course.id).length;
                      const percent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

                      return (
                        <Card 
                          key={course.id} 
                          className="border-slate-200 bg-white hover:border-red-200 transition-all duration-200 hover:shadow-md overflow-hidden flex flex-col h-full"
                        >
                          <div className="p-6 flex-1 space-y-4">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="bg-red-50 border-red-100 text-red-600 font-semibold text-[10px] uppercase tracking-wider px-1.5 py-0">
                                {course.category || 'Onboarding'}
                              </Badge>
                              <span className="text-[10px] font-mono font-medium text-slate-400">
                                {courseChapters.length} Chapters • {totalLessons} Lessons
                              </span>
                            </div>

                            <div className="space-y-1.5">
                              <h4 className="text-base font-bold text-slate-900 font-sans tracking-tight line-clamp-1">
                                {course.title}
                              </h4>
                              <p className="text-xs text-slate-500 font-sans line-clamp-2 leading-relaxed h-8">
                                {course.description || "No description provided."}
                              </p>
                            </div>

                            <div className="space-y-2 pt-2">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-slate-600">Progress</span>
                                <span className="font-mono font-bold text-slate-900">{completedLessons}/{totalLessons} completed ({percent}%)</span>
                              </div>
                              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-red-600 h-full transition-all duration-300" style={{ width: `${percent}%` }} />
                              </div>
                            </div>
                          </div>

                          <div className="bg-slate-50 border-t border-slate-100 p-4 flex gap-2 justify-between items-center mt-auto">
                            {isOnboardingAdminMode && isAdmin ? (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 border-red-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteCourse(course.id);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                              </Button>
                            ) : (
                              <div />
                            )}

                            <Button 
                              onClick={() => {
                                setActiveCourseId(course.id);
                                if (courseChapters.length > 0) {
                                  const firstChapterLessons = lessons.filter(l => l.chapterId === courseChapters[0].id).sort((a,b) => a.order - b.order);
                                  if (firstChapterLessons.length > 0) {
                                    setActiveLessonId(firstChapterLessons[0].id);
                                  }
                                }
                              }} 
                              className="bg-red-600 hover:bg-red-700 font-bold text-xs h-8 px-4"
                            >
                              {percent === 100 ? 'Review Course' : percent > 0 ? 'Resume Course' : 'Start Course'}
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </motion.div>
              );
            }

            return (
              <motion.div
                key="onboarding-main"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="space-y-6 flex flex-col"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setActiveCourseId(null);
                    setActiveLessonId(null);
                  }}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 -ml-2 self-start flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Course Catalog
                </Button>

                {/* Course Progress Header Bar */}
                <Card className="border-slate-200 bg-white shadow-xs p-5">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-red-50 border-red-100 text-red-600 font-semibold text-[10px] uppercase tracking-wider px-1.5 py-0">
                          {currentCourse?.category || 'Onboarding'}
                        </Badge>
                        <h3 className="text-lg font-bold text-slate-900 font-sans">{currentCourse?.title}</h3>
                      </div>
                      <p className="text-xs text-slate-500 font-sans max-w-2xl">{currentCourse?.description}</p>
                    </div>

                    <div className="w-full md:w-64 space-y-1.5 shrink-0">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-600">Progress Tracker</span>
                        <span className="font-mono font-bold text-slate-900">{completedLessons} / {totalLessons} completed ({percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div className="bg-red-600 h-full transition-all duration-500" style={{ width: `${percent}%` }} />
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Left Sidebar: Course Chapters & Lessons list */}
                  <div className="lg:col-span-4 space-y-4">
                    {/* Course Selector Dropdown if multiple courses */}
                    {courses.length > 1 && (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider font-mono">Select Course</Label>
                        <Select value={activeCourseId || ''} onValueChange={setActiveCourseId}>
                          <SelectTrigger className="bg-white border-slate-200 h-10 shadow-xs">
                            <SelectValue placeholder="Choose a course..." />
                          </SelectTrigger>
                          <SelectContent>
                            {courses.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                      <div className="bg-slate-50 border-b border-slate-200 p-4">
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-red-500" /> Syllabus / Course outline
                        </h4>
                      </div>

                      <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {courseChapters.map((chapter) => {
                          const chapterLessons = lessons.filter(l => l.chapterId === chapter.id).sort((a,b) => a.order - b.order);
                          return (
                            <div key={chapter.id} className="p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <h5 className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                  <span>{chapter.title}</span>
                                </h5>
                                {isOnboardingAdminMode && isAdmin && (
                                  <div className="flex gap-1">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      onClick={() => {
                                        if (confirm("Are you sure you want to delete this chapter and all its lessons?")) {
                                          handleDeleteChapter(chapter.id);
                                        }
                                      }}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>

                              <div className="space-y-1">
                                {chapterLessons.map((lesson) => {
                                  const isCompleted = progressList.some(p => p.lessonId === lesson.id);
                                  const isActive = lesson.id === activeLessonId;
                                  return (
                                    <div 
                                      key={lesson.id}
                                      className={`group w-full flex items-center justify-between p-2 rounded-lg text-left transition-all text-xs cursor-pointer ${
                                        isActive 
                                          ? 'bg-red-50 border border-red-200 text-red-700 font-semibold' 
                                          : 'hover:bg-slate-50 border border-transparent text-slate-600'
                                      }`}
                                      onClick={() => setActiveLessonId(lesson.id)}
                                    >
                                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        <button 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleToggleLessonProgress(lesson.id, currentCourse.id);
                                          }}
                                          className="shrink-0 transition-transform active:scale-95 animate-none"
                                        >
                                          {isCompleted ? (
                                            <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                                          ) : (
                                            <div className="w-4 h-4 rounded-full border-2 border-slate-300 hover:border-red-500" />
                                          )}
                                        </button>
                                        <div className="min-w-0 flex-1">
                                          <p className={`truncate ${isActive ? 'text-red-800' : 'text-slate-800'}`}>{lesson.title}</p>
                                          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-medium">
                                            <span className="flex items-center gap-0.5">
                                              <Clock className="w-2.5 h-2.5" /> {lesson.duration || 5} min
                                            </span>
                                            {lesson.videoUrl && (
                                              <span className="flex items-center gap-0.5 text-blue-500">
                                                <Video className="w-2.5 h-2.5" /> Video
                                              </span>
                                            )}
                                            {lesson.textBody && (
                                              <span className="flex items-center gap-0.5 text-emerald-600">
                                                <FileText className="w-2.5 h-2.5" /> Guide
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      {isOnboardingAdminMode && isAdmin && (
                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 w-6 p-0 text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setNewLesson({
                                                courseId: lesson.courseId,
                                                chapterId: lesson.chapterId,
                                                title: lesson.title,
                                                description: lesson.description || '',
                                                videoUrl: lesson.videoUrl || '',
                                                textBody: lesson.textBody || '',
                                                duration: lesson.duration || 5,
                                                order: lesson.order || 1,
                                              });
                                              setEditingLessonId(lesson.id);
                                              setIsNewLessonOpen(true);
                                            }}
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                          <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleDeleteLesson(lesson.id);
                                            }}
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {chapterLessons.length === 0 && (
                                  <p className="text-[10px] text-slate-400 italic pl-6 py-2">No lessons in this chapter yet.</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {courseChapters.length === 0 && (
                          <div className="p-8 text-center">
                            <p className="text-xs text-slate-400 italic">No chapters created yet. Open builder mode to create chapters and lessons.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Panel: Immersive Video Player & Study Guide */}
                  <div className="lg:col-span-8 space-y-6">
                    {activeLesson ? (
                      <Card className="border-slate-200 bg-white shadow-xs overflow-hidden flex flex-col">
                        {/* Video Screen Area */}
                        {activeLesson.videoUrl ? (
                          <div className="aspect-video w-full bg-slate-950 relative border-b border-slate-200">
                            {isDirectVideo(activeLesson.videoUrl) ? (
                              <video 
                                src={activeLesson.videoUrl} 
                                controls 
                                className="w-full h-full object-contain" 
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <iframe 
                                src={getEmbedUrl(activeLesson.videoUrl)} 
                                className="w-full h-full border-none"
                                allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media" 
                                allowFullScreen
                                referrerPolicy="no-referrer"
                                title={activeLesson.title}
                              />
                            )}
                          </div>
                        ) : (
                          <div className="bg-gradient-to-br from-amber-50/50 to-orange-50/50 p-8 border-b border-slate-100 flex flex-col items-center justify-center text-center space-y-3">
                            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shadow-sm">
                              <BookOpen className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                              <h5 className="text-sm font-bold text-amber-900 font-sans">Reading-Only Training Module</h5>
                              <p className="text-xs text-amber-700 max-w-md font-sans leading-relaxed">This module does not require a video. Please read the detailed instructions and operational manual below.</p>
                            </div>
                          </div>
                        )}

                        {/* Title & Stats */}
                        <div className="p-6 border-b border-slate-100 space-y-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <h4 className="text-xl font-bold text-slate-900 leading-snug font-sans">{activeLesson.title}</h4>
                              {activeLesson.description && (
                                <p className="text-xs text-slate-500 font-sans">{activeLesson.description}</p>
                              )}
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <Badge variant="outline" className="text-xs font-semibold px-2 py-0.5 bg-slate-50 text-slate-600 flex items-center gap-1">
                                <Clock className="w-3 h-3" /> {activeLesson.duration || 5} mins
                              </Badge>
                              {progressList.some(p => p.lessonId === activeLesson.id) ? (
                                <Badge className="text-xs font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 border-emerald-200">
                                  Completed 🎉
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-500">
                                  Incomplete
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Text guide content */}
                        <div className="p-6 space-y-4">
                          <h5 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Accompanying Guide & Checklist</h5>
                          <div className="bg-slate-50/50 border border-slate-150 rounded-xl p-6 font-sans text-sm text-slate-700 leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto custom-scrollbar">
                            {activeLesson.textBody || "No instructions provided for this lesson yet."}
                          </div>
                        </div>

                        {/* Completion / Next Action buttons */}
                        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between gap-4">
                          <Button
                            onClick={() => handleToggleLessonProgress(activeLesson.id, currentCourse.id)}
                            className={`font-semibold text-xs gap-1.5 shadow-xs ${
                              progressList.some(p => p.lessonId === activeLesson.id)
                                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                          >
                            {progressList.some(p => p.lessonId === activeLesson.id) ? (
                              <>Mark as Incomplete</>
                            ) : (
                              <>Mark as Completed 🎉</>
                            )}
                          </Button>

                          <Button
                            onClick={handleNextLesson}
                            variant="outline"
                            className="border-slate-200 font-semibold text-xs gap-1.5"
                          >
                            Next Lesson <ChevronRight className="w-4 h-4" />
                          </Button>
                        </div>
                      </Card>
                    ) : (
                      <Card className="border-slate-200 bg-white p-16 text-center shadow-xs flex flex-col items-center justify-center space-y-4 h-96">
                        <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center border border-slate-100 shadow-xs">
                          <BookOpen className="w-8 h-8" />
                        </div>
                        <div className="space-y-1">
                          <h4 className="text-base font-bold text-slate-800 font-sans">No Lesson Selected</h4>
                          <p className="text-xs text-slate-400 max-w-sm leading-relaxed font-sans">Select any training module from the course outline on the left to begin learning.</p>
                        </div>
                      </Card>
                    )}
                  </div>
                </div>

                {/* --- COURSE BUILDER DIALOGS (ONLY ACCESSIBLE FOR ADMINS) --- */}
                {isAdmin && (
                  <>
                    {/* 1. New/Edit Course Dialog */}
                    <Dialog open={isNewCourseOpen} onOpenChange={setIsNewCourseOpen}>
                      <DialogContent className="sm:max-w-[450px]">
                        <DialogHeader>
                          <DialogTitle>Create Custom Course</DialogTitle>
                          <DialogDescription>Add a new coaching or training curriculum for your trainers.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-title">Course Title</Label>
                            <Input 
                              id="course-title"
                              value={newCourse.title}
                              onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                              placeholder="e.g. Front Desk & Reception Training"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-desc">Description</Label>
                            <Textarea 
                              id="course-desc"
                              value={newCourse.description}
                              onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                              placeholder="Describe what the trainers will learn in this course..."
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="course-category">Category</Label>
                            <Input 
                              id="course-category"
                              value={newCourse.category}
                              onChange={(e) => setNewCourse({ ...newCourse, category: e.target.value })}
                              placeholder="e.g. Onboarding, Operations, Certifications"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsNewCourseOpen(false)}>Cancel</Button>
                          <Button onClick={handleCreateCourse} className="bg-red-600 hover:bg-red-700">Create Course</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 2. New Chapter Dialog */}
                    <Dialog open={isNewChapterOpen} onOpenChange={setIsNewChapterOpen}>
                      <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                          <DialogTitle>Add New Chapter</DialogTitle>
                          <DialogDescription>Group training lessons into sequential chapters.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-3">
                          <div className="grid gap-1.5">
                            <Label htmlFor="chapter-title">Chapter Title</Label>
                            <Input 
                              id="chapter-title"
                              value={newChapter.title}
                              onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                              placeholder="e.g. Chapter 1: Gym Etiquette & Cleanliness"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="chapter-order">Display Order Index</Label>
                            <Input 
                              id="chapter-order"
                              type="number"
                              value={newChapter.order}
                              onChange={(e) => setNewChapter({ ...newChapter, order: Number(e.target.value) })}
                              placeholder="1"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => setIsNewChapterOpen(false)}>Cancel</Button>
                          <Button onClick={handleCreateChapter} className="bg-red-600 hover:bg-red-700">Create Chapter</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    {/* 3. New/Edit Lesson Dialog */}
                    <Dialog open={isNewLessonOpen} onOpenChange={(open) => {
                      if (!open) {
                        setEditingLessonId(null);
                        setNewLesson({
                          courseId: '',
                          chapterId: '',
                          title: '',
                          description: '',
                          videoUrl: '',
                          textBody: '',
                          duration: 5,
                          order: 1,
                        });
                      }
                      setIsNewLessonOpen(open);
                    }}>
                      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingLessonId ? 'Edit Training Lesson' : 'Add Training Lesson'}</DialogTitle>
                          <DialogDescription>Upload instruction videos, set descriptions, and write accompanying checklists.</DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-3">
                          {!editingLessonId && (
                            <div className="grid gap-1.5">
                              <Label htmlFor="lesson-chapter">Chapter Section</Label>
                              <Select 
                                value={newLesson.chapterId} 
                                onValueChange={(val) => setNewLesson({ ...newLesson, chapterId: val })}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a chapter..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {courseChapters.map(chap => (
                                    <SelectItem key={chap.id} value={chap.id}>{chap.title}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div className="grid gap-1.5">
                            <Label htmlFor="lesson-title">Lesson Title</Label>
                            <Input 
                              id="lesson-title"
                              value={newLesson.title}
                              onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })}
                              placeholder="e.g. 1.1 Floor Inspection Checklist"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="lesson-desc">Short Caption</Label>
                            <Input 
                              id="lesson-desc"
                              value={newLesson.description}
                              onChange={(e) => setNewLesson({ ...newLesson, description: e.target.value })}
                              placeholder="A brief overview of the module content"
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="lesson-video">Video Link (YouTube, Vimeo, MP4, etc.)</Label>
                            <Input 
                              id="lesson-video"
                              value={newLesson.videoUrl}
                              onChange={(e) => setNewLesson({ ...newLesson, videoUrl: e.target.value })}
                              placeholder="https://www.youtube.com/watch?v=..."
                            />
                            <p className="text-[10px] text-slate-400">Supports direct MP4 links, YouTube videos, and Vimeo embeds automatically.</p>
                          </div>
                          <div className="grid gap-1.5">
                            <Label htmlFor="lesson-text">Written Instructions / Checklist Guide</Label>
                            <Textarea 
                              id="lesson-text"
                              value={newLesson.textBody}
                              onChange={(e) => setNewLesson({ ...newLesson, textBody: e.target.value })}
                              placeholder="Enter step-by-step checklists, notes, and guidelines for the trainer..."
                              className="min-h-[150px]"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="grid gap-1.5">
                              <Label htmlFor="lesson-duration">Duration (Minutes)</Label>
                              <Input 
                                id="lesson-duration"
                                type="number"
                                value={newLesson.duration}
                                onChange={(e) => setNewLesson({ ...newLesson, duration: Number(e.target.value) })}
                                placeholder="5"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label htmlFor="lesson-order">Display Order Index</Label>
                              <Input 
                                id="lesson-order"
                                type="number"
                                value={newLesson.order}
                                onChange={(e) => setNewLesson({ ...newLesson, order: Number(e.target.value) })}
                                placeholder="1"
                              />
                            </div>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button variant="outline" onClick={() => {
                            setEditingLessonId(null);
                            setIsNewLessonOpen(false);
                          }}>Cancel</Button>
                          <Button 
                            onClick={editingLessonId ? handleUpdateLesson : handleCreateLesson}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            {editingLessonId ? 'Save Changes' : 'Add Lesson'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </motion.div>
            );
          })()}


        </AnimatePresence>
      </main>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          {selectedTask && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={`${getPriorityColor(selectedTask.priority)} border capitalize`}>
                    {selectedTask.priority} Priority
                  </Badge>
                  <Badge variant="outline" className="capitalize flex items-center gap-1">
                    {getStatusIcon(selectedTask.status)}
                    {selectedTask.status.replace('-', ' ')}
                  </Badge>
                </div>
                <DialogTitle className="text-2xl font-bold">{selectedTask.title}</DialogTitle>
                <DialogDescription className="text-slate-500 pt-2">
                  {selectedTask.description || "No description provided."}
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-6 border-y border-slate-100 my-4">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Assigned To</h4>
                    <div className="flex flex-col gap-2 max-h-32 overflow-y-auto">
                      {selectedTask.assignedToIds && selectedTask.assignedToIds.length > 0 ? (
                        selectedTask.assignedToIds.map(trainerId => {
                          const tr = trainers.find(t => t.id === trainerId);
                          return (
                            <div key={trainerId} className="flex items-center gap-2">
                              <Avatar className="w-6 h-6 border">
                                <AvatarImage src={tr?.photoURL || `https://picsum.photos/seed/${trainerId}/100/100`} />
                                <AvatarFallback className="text-[9px]">{(tr?.name || 'U')[0]}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs font-semibold text-slate-700">{tr?.name || 'Unknown Trainer'}</span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarImage src={trainers.find(t => t.id === selectedTask.assignedTo)?.photoURL || `https://picsum.photos/seed/${selectedTask.assignedTo}/100/100`} />
                            <AvatarFallback>{(selectedTask.assignedToName || 'U')[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-bold">{selectedTask.assignedToName}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Assigned By</h4>
                    <p className="text-sm font-medium text-slate-700">{selectedTask.createdByName || 'Unknown'}</p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Due Date</h4>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Calendar className="w-4 h-4" />
                      <span className="text-sm font-medium">
                        {format(new Date(selectedTask.dueDate), 'MMMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Questions & Discussion</h4>
                    <Badge variant="secondary" className="text-[10px]">
                      {(selectedTask.questions?.length || 0)}
                    </Badge>
                  </div>
                  
                  <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                    {(selectedTask.questions || []).length === 0 ? (
                      <p className="text-xs text-slate-400 italic text-center py-4">No questions yet</p>
                    ) : (
                      (selectedTask.questions || []).map((q) => (
                        <div key={q.id} className="bg-slate-50 rounded-lg p-3 space-y-2 border border-slate-100">
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-bold text-red-600 uppercase">{q.authorName}</span>
                            <span className="text-[9px] text-slate-400">{format(new Date(q.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-xs text-slate-700">{q.text}</p>
                          
                          {q.isAnswered ? (
                            <div className="mt-2 pl-3 border-l-2 border-green-200 bg-green-50/50 p-2 rounded-r-md">
                              <p className="text-[10px] font-bold text-green-700 uppercase mb-1">Answer</p>
                              <p className="text-xs text-slate-600">{q.answer}</p>
                            </div>
                          ) : (
                            isAdmin && (
                              <div className="mt-2 flex gap-2">
                                <Input 
                                  placeholder="Type answer..." 
                                  className="h-7 text-xs"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleAnswerQuestion(selectedTask.id, q.id, (e.target as HTMLInputElement).value);
                                      (e.target as HTMLInputElement).value = '';
                                    }
                                  }}
                                />
                                <Button size="sm" className="h-7 text-[10px] px-2" onClick={(e) => {
                                  const input = (e.currentTarget.previousSibling as HTMLInputElement);
                                  handleAnswerQuestion(selectedTask.id, q.id, input.value);
                                  input.value = '';
                                }}>
                                  Reply
                                </Button>
                              </div>
                            )
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Input 
                      placeholder="Ask a question..." 
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      className="text-xs focus-visible:ring-red-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newQuestion.trim()) {
                          handleAddQuestion(selectedTask.id);
                        }
                      }}
                    />
                    <Button 
                      size="sm" 
                      className="bg-red-600 hover:bg-red-700 h-9"
                      onClick={() => handleAddQuestion(selectedTask.id)}
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-900">Update Status</h4>
                  <div className="flex gap-2">
                    {(['pending', 'in-progress', 'completed'] as TaskStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant={selectedTask.status === status ? 'default' : 'outline'}
                        size="sm"
                        className={`capitalize ${selectedTask.status === status ? 'bg-red-600 hover:bg-red-700' : ''}`}
                        onClick={() => {
                          handleUpdateTaskStatus(selectedTask.id, status);
                        }}
                      >
                        {status.replace('-', ' ')}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="sm:justify-between items-center">
                <div className="flex items-center gap-4">
                  <p className="text-[10px] text-slate-400">Created {format(new Date(selectedTask.createdAt), 'MMM d, yyyy')}</p>
                  {(isAdmin || selectedTask.createdBy === user?.id) && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 h-7 text-[10px] gap-1"
                      onClick={() => handleDeleteTask(selectedTask.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete Task
                    </Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setSelectedTaskId(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
