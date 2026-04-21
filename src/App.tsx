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
  LogOut,
  UserPlus,
  Repeat,
  Trash2,
  Edit2,
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
  arrayUnion
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
  StaffMember,
  VacationRequest,
  VacationStatus,
  Location
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
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trainers, setTrainers] = useState<Trainer[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [vacations, setVacations] = useState<VacationRequest[]>([]);

  // Fetch Tasks from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'tasks';
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
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
  }, [user]);

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
    if (!user || user.role !== 'admin') return;
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

  // Fetch Staff Members from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'staff';
    const q = query(collection(db, path), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const staffList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as StaffMember[];
      setStaffMembers(staffList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Vacations from Firestore
  useEffect(() => {
    if (!user) return;
    const path = 'vacations';
    const q = query(collection(db, path), orderBy('startDate', 'desc'));
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
  }, [user]);

  const [activeTab, setActiveTab] = useState('tasks');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isNewStaffOpen, setIsNewStaffOpen] = useState(false);
  const [isNewVacationOpen, setIsNewVacationOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newQuestion, setNewQuestion] = useState('');

  const [newStaff, setNewStaff] = useState({
    name: '',
    location: 'Dorset Street' as Location,
    department: '',
    status: 'active' as const
  });

  const [newVacation, setNewVacation] = useState({
    staffId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'vacation' as const,
    hours: 8,
    notes: ''
  });
  const [editingVacationId, setEditingVacationId] = useState<string | null>(null);

  const selectedTask = useMemo(() => {
    return tasks.find(t => t.id === selectedTaskId) || null;
  }, [tasks, selectedTaskId]);

  // Simple New Task Form State
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    assignedToId: '',
    priority: 'medium' as Priority,
    dueDate: new Date().toISOString().split('T')[0],
  });

  // New Invite Form State
  const [newInvite, setNewInvite] = useState<Partial<Invite>>({
    email: '',
    role: 'trainer',
  });

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.assignedToName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tasks, searchQuery]);

  const handleCreateTask = async () => {
    if (!newTask.title || !newTask.assignedToId) {
      toast.error("Please provide a title and select a trainer");
      return;
    }

    const trainer = trainers.find(t => t.id === newTask.assignedToId);
    
    const taskData: Omit<Task, 'id'> = {
      title: newTask.title,
      description: newTask.description,
      assignedTo: newTask.assignedToId,
      assignedToName: trainer?.name || 'Unknown',
      status: 'pending',
      priority: newTask.priority,
      dueDate: new Date(newTask.dueDate).toISOString(),
      createdAt: new Date().toISOString(),
      createdBy: user?.id || 'unknown',
      isRecurring: false,
      recurrenceInterval: 'none',
      notes: [],
      questions: [],
    };

    try {
      await addDoc(collection(db, 'tasks'), taskData);
      setIsNewTaskOpen(false);
      setNewTask({
        title: '',
        description: '',
        assignedToId: '',
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

  const handleSendInvite = async () => {
    if (!user || user.role !== 'admin' || !newInvite.email) {
      toast.error("Admin permissions and email required");
      return;
    }

    const email = newInvite.email.toLowerCase().trim();

    const inviteData: Omit<Invite, 'id'> = {
      email: email,
      role: (newInvite.role as UserRole) || 'trainer',
      status: 'pending',
      invitedBy: user.id,
      invitedByName: user.name || user.email,
      sentAt: new Date().toISOString(),
    };

    try {
      // Use email as ID for consistency with AuthContext login checks
      await setDoc(doc(db, 'invites', email), inviteData);
      setNewInvite({ email: '', role: 'trainer' });
      setIsInviteOpen(false);
      toast.success(`Invite sent successfully to ${email}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `invites/${email}`);
    }
  };

  const handleRemoveMember = async (trainerId: string) => {
    if (!user || user.role !== 'admin') return;
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
    if (!user || user.role !== 'admin') return;

    if (!window.confirm("Are you sure you want to cancel this invitation?")) return;

    try {
      await deleteDoc(doc(db, 'invites', inviteId));
      toast.success("Invitation cancelled successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `invites/${inviteId}`);
    }
  };

  const handleCreateStaff = async () => {
    if (!newStaff.name || !newStaff.location) {
      toast.error("Name and location are required");
      return;
    }
    try {
      await addDoc(collection(db, 'staff'), newStaff);
      setNewStaff({ name: '', location: 'Dorset Street', department: '', status: 'active' });
      setIsNewStaffOpen(false);
      toast.success("Staff member added");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'staff');
    }
  };

  const handleRemoveStaff = async (staffId: string) => {
    if (!user || user.role !== 'admin') return;
    if (!window.confirm("Are you sure you want to remove this staff member? All their vacation records will remain.")) return;
    try {
      await deleteDoc(doc(db, 'staff', staffId));
      toast.success("Staff member removed");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `staff/${staffId}`);
    }
  };

  const handleCreateVacation = async () => {
    if (!newVacation.staffId || !newVacation.startDate || !newVacation.endDate) {
      toast.error("Please fill in all required fields");
      return;
    }
    const staff = staffMembers.find(s => s.id === newVacation.staffId);
    const start = new Date(newVacation.startDate);
    const end = new Date(newVacation.endDate);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    try {
      if (editingVacationId) {
        const vacationData = {
          staffId: newVacation.staffId,
          staffName: staff?.name || 'Unknown',
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
          staffId: newVacation.staffId,
          staffName: staff?.name || 'Unknown',
          startDate: newVacation.startDate,
          endDate: newVacation.endDate,
          status: 'pending' as VacationStatus,
          type: newVacation.type,
          hours: Number(newVacation.hours) || 8,
          notes: newVacation.notes,
          createdAt: new Date().toISOString(),
          totalDays
        };
        await addDoc(collection(db, 'vacations'), vacationData);
        toast.success("Vacation request submitted");
      }

      setNewVacation({ 
        staffId: '', 
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
    if (user?.role !== 'admin') {
      toast.error("Only administrators can edit vacation requests.");
      return;
    }
    setNewVacation({
      staffId: vacation.staffId,
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
    if (!user || user.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'vacations', vacationId), { status });
      toast.success(`Vacation request ${status}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `vacations/${vacationId}`);
    }
  };

  const handleRemoveVacation = async (vacationId: string) => {
    if (!user || user.role !== 'admin') return;
    if (!window.confirm("Are you sure you want to delete this vacation record?")) return;
    try {
      await deleteDoc(doc(db, 'vacations', vacationId));
      toast.success("Vacation record deleted");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `vacations/${vacationId}`);
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
            onClick={() => setActiveTab('vacations')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'vacations' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Umbrella className="w-5 h-5" />
            <span>Vacations</span>
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
            </h2>
            <p className="text-slate-500 mt-1">
              {activeTab === 'tasks' && 'Assign and track progress of team operations.'}
              {activeTab === 'team' && 'Manage trainers and their roles within the team.'}
            </p>
          </div>

          <div className="flex gap-3">
            <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
              <DialogTrigger
                render={
                  <Button className="bg-red-600 hover:bg-red-700 shadow-md shadow-red-100 gap-2">
                    <Plus className="w-4 h-4" />
                    New Task
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-[500px]">
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
                    <Label htmlFor="assignedTo">Assign To</Label>
                    <Select 
                      value={newTask.assignedToId} 
                      onValueChange={(val) => setNewTask({ ...newTask, assignedToId: val })}
                    >
                      <SelectTrigger id="assignedTo">
                        <SelectValue placeholder="Select trainer" />
                      </SelectTrigger>
                      <SelectContent>
                        {trainers.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <CardTitle className="text-base font-bold mt-2 leading-snug">{task.title}</CardTitle>
                          </CardHeader>
                          <CardContent className="p-4 pt-0">
                            <p className="text-xs text-slate-500 line-clamp-2 mb-4">{task.description}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Avatar className="w-6 h-6">
                                  <AvatarImage src={trainers.find(t => t.id === task.assignedTo)?.photoURL || `https://picsum.photos/seed/${task.assignedTo}/100/100`} />
                                  <AvatarFallback>{task.assignedToName[0]}</AvatarFallback>
                                </Avatar>
                                <span className="text-[11px] font-medium text-slate-600">{task.assignedToName}</span>
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
                  <h3 className="text-xl font-bold text-slate-900">Active Trainers</h3>
                  <p className="text-sm text-slate-500">Currently active members of the training team.</p>
                </div>
                <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                  <DialogTrigger
                    render={
                      <Button className="bg-red-600 hover:bg-red-700 gap-2">
                        <UserPlus className="w-4 h-4" />
                        Invite Member
                      </Button>
                    }
                  />
                  <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Invite Team Member</DialogTitle>
                      <DialogDescription>
                        Send an invitation to a new team member. They will receive an email to join the Vasta dashboard.
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

              <Card className="border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="w-[300px]">Trainer</TableHead>
                      <TableHead>Email</TableHead>
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
                              <p className="text-xs text-slate-500">ID: {trainer.id}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-600">{trainer.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`capitalize ${trainer.role === 'admin' ? 'border-red-200 text-red-700 bg-red-50' : 'border-slate-200 text-slate-600'}`}>
                            {trainer.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-red-500" 
                                style={{ width: `${(tasks.filter(t => t.assignedTo === trainer.id && t.status !== 'completed').length / 5) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium text-slate-500">
                              {tasks.filter(t => t.assignedTo === trainer.id && t.status !== 'completed').length}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {user.role === 'admin' && (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-slate-400 hover:text-red-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  handleRemoveMember(trainer.id);
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
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

              {invites.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Pending Invitations</h3>
                    <p className="text-sm text-slate-500">Sent invites that haven't been accepted yet.</p>
                  </div>
                  <Card className="border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/50">
                          <TableHead>Recipient</TableHead>
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
                                {user.role === 'admin' && (
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
                  <Dialog open={isNewStaffOpen} onOpenChange={setIsNewStaffOpen}>
                    <DialogTrigger
                      render={
                        <Button variant="outline" className="gap-2">
                          <Users className="w-4 h-4" />
                          Manage Staff
                        </Button>
                      }
                    />
                    <DialogContent className="sm:max-w-[500px]">
                      <DialogHeader>
                        <DialogTitle>Staff Management</DialogTitle>
                        <DialogDescription>Add or remove staff members managed in this dashboard.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 pb-4">
                          <div className="grid gap-2">
                            <Label>Name</Label>
                            <Input 
                              value={newStaff.name} 
                              onChange={e => setNewStaff({...newStaff, name: e.target.value})}
                              placeholder="Full Name"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label>Location</Label>
                            <Select 
                              value={newStaff.location} 
                              onValueChange={val => setNewStaff({...newStaff, location: val as Location})}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Dorset Street">Dorset Street</SelectItem>
                                <SelectItem value="Shelburne Road">Shelburne Road</SelectItem>
                                <SelectItem value="West Palm Beach">West Palm Beach</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid gap-2 col-span-2">
                            <Button onClick={handleCreateStaff} className="w-full bg-red-600 hover:bg-red-700">Add Staff Member</Button>
                          </div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto space-y-2">
                          <h4 className="text-sm font-semibold">Active Staff</h4>
                          {staffMembers.map(staff => (
                            <div key={staff.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                              <div>
                                <p className="text-sm font-medium">{staff.name}</p>
                                <p className="text-xs text-slate-500">{staff.location}</p>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                className="text-slate-400 hover:text-red-600"
                                onClick={() => handleRemoveStaff(staff.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={isNewVacationOpen} onOpenChange={(open) => {
                    setIsNewVacationOpen(open);
                    if (!open) {
                      setEditingVacationId(null);
                      setNewVacation({ 
                        staffId: '', 
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
                    <DialogContent className="sm:max-w-[425px]">
                      <DialogHeader>
                        <DialogTitle>{editingVacationId ? 'Edit Vacation Request' : 'Log Vacation Request'}</DialogTitle>
                        <DialogDescription>
                          {editingVacationId ? 'Modify the existing time-off request details.' : 'Submit a new time-off request for a staff member.'}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label>Staff Member</Label>
                          <Select 
                            value={newVacation.staffId} 
                            onValueChange={val => setNewVacation({...newVacation, staffId: val})}
                            disabled={!!editingVacationId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select staff..." />
                            </SelectTrigger>
                            <SelectContent>
                              {staffMembers.map(s => (
                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
                              value={newVacation.hours} 
                              onChange={e => setNewVacation({...newVacation, hours: parseFloat(e.target.value)})}
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
                                      title={`${v.staffName} (${v.type})${v.hours ? ` - ${v.hours}hrs` : ''}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditVacation(v);
                                      }}
                                    >
                                      {v.staffName} {v.hours && <span className="opacity-60 text-[8px]">({v.hours}h)</span>}
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
                          <TableHead>Staff Member</TableHead>
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
                                {vacation.staffName}
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
                                {user.role === 'admin' && (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-slate-400 hover:text-blue-600"
                                    onClick={() => handleEditVacation(vacation)}
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </Button>
                                )}
                                {user.role === 'admin' && vacation.status === 'pending' && (
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
                                {user.role === 'admin' && (
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
        </AnimatePresence>
      </main>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTaskId} onOpenChange={(open) => !open && setSelectedTaskId(null)}>
        <DialogContent className="sm:max-w-[500px]">
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
                    <div className="flex items-center gap-3">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={trainers.find(t => t.id === selectedTask.assignedTo)?.photoURL || `https://picsum.photos/seed/${selectedTask.assignedTo}/100/100`} />
                        <AvatarFallback>{selectedTask.assignedToName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold">{selectedTask.assignedToName}</p>
                      </div>
                    </div>
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
                            user?.role === 'admin' && (
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
                <p className="text-[10px] text-slate-400">Created {format(new Date(selectedTask.createdAt), 'MMM d, yyyy')}</p>
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
