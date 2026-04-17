/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CheckSquare, 
  Users, 
  Bell, 
  Plus, 
  Search, 
  Filter, 
  MoreVertical, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  Mail,
  Send,
  Sparkles,
  ChevronRight,
  LogOut,
  Settings,
  UserPlus,
  MailPlus,
  Repeat,
  MessageSquare,
  StickyNote,
  HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { LoginPage } from './components/LoginPage';
import { db, auth } from './lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy, 
  Timestamp,
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { mockTasks, mockTrainers, mockAlerts } from './lib/mockData';
import { Task, Trainer, Alert, TaskStatus, Priority, Invite, UserRole, RecurrenceInterval, TaskNote, TaskQuestion } from './types';
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
      setTasks(taskList.length > 0 ? taskList : mockTasks);
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
      setTrainers(trainerList.length > 0 ? trainerList : mockTrainers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });
    return () => unsubscribe();
  }, [user]);

  // Fetch Alerts from Firestore
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
  const [activeTab, setActiveTab] = useState('tasks');
  const [searchQuery, setSearchQuery] = useState('');
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isNewAlertOpen, setIsNewAlertOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [newNote, setNewNote] = useState('');
  const [newQuestion, setNewQuestion] = useState('');

  // New Task Form State
  const [newTask, setNewTask] = useState<{
    title: string;
    description: string;
    assignedTo: string[];
    status: TaskStatus;
    priority: Priority;
    dueDate: string;
    isRecurring: boolean;
    recurrenceInterval: RecurrenceInterval;
  }>({
    title: '',
    description: '',
    assignedTo: [],
    status: 'pending',
    priority: 'medium',
    dueDate: new Date().toISOString().split('T')[0],
    isRecurring: false,
    recurrenceInterval: 'none',
  });

  // New Alert Form State
  const [newAlert, setNewAlert] = useState<Partial<Alert>>({
    recipientEmail: '',
    subject: '',
    body: '',
  });

  // New Invite Form State
  const [newInvite, setNewInvite] = useState<Partial<Invite>>({
    email: '',
    role: 'trainer',
  });
  const [isDrafting, setIsDrafting] = useState(false);

  // Filtered Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => 
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.assignedToName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [tasks, searchQuery]);

  const handleCreateTask = async () => {
    if (!newTask.title || newTask.assignedTo.length === 0) {
      toast.error("Please fill in all required fields and select at least one trainer");
      return;
    }

    const path = 'tasks';
    try {
      const promises = newTask.assignedTo.map(async (trainerId) => {
        const trainer = trainers.find(t => t.id === trainerId);
        const taskData = {
          title: newTask.title,
          description: newTask.description,
          assignedTo: trainerId,
          assignedToName: trainer?.name || 'Unknown',
          status: newTask.status,
          priority: newTask.priority,
          dueDate: new Date(newTask.dueDate).toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: user?.id,
          isRecurring: newTask.isRecurring,
          recurrenceInterval: newTask.recurrenceInterval,
          notes: [],
          questions: [],
        };
        try {
          return await addDoc(collection(db, path), taskData);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      });

      await Promise.all(promises);
      setIsNewTaskOpen(false);
      setNewTask({ 
        title: '',
        description: '',
        assignedTo: [],
        status: 'pending', 
        priority: 'medium', 
        dueDate: new Date().toISOString().split('T')[0],
        isRecurring: false,
        recurrenceInterval: 'none'
      });
      toast.success(`${newTask.assignedTo.length} task(s) assigned successfully`);
    } catch (error) {
      console.error("Error creating task:", error);
      toast.error("Failed to assign tasks. Please check permissions.");
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: TaskStatus) => {
    const path = `tasks/${taskId}`;
    try {
      await updateDoc(doc(db, 'tasks', taskId), { status: newStatus });
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus });
      }
      toast.success(`Task status updated to ${newStatus}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      toast.error("Failed to update task status");
    }
  };

  const handleAddNote = async (taskId: string) => {
    if (!newNote.trim()) return;
    const note: TaskNote = {
      id: `n${Date.now()}`,
      text: newNote,
      createdAt: new Date().toISOString(),
      authorName: user?.name || 'Team Member',
    };
    
    const path = `tasks/${taskId}`;
    try {
      const task = tasks.find(t => t.id === taskId);
      const updatedNotes = [...(task?.notes || []), note];
      await updateDoc(doc(db, 'tasks', taskId), { notes: updatedNotes });
      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, notes: updatedNotes });
      }
      setNewNote('');
      toast.success("Note added");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
      toast.error("Failed to add note");
    }
  };

  const handleAskQuestion = async (taskId: string) => {
    if (!newQuestion.trim()) return;
    const question: TaskQuestion = {
      id: `q${Date.now()}`,
      text: newQuestion,
      createdAt: new Date().toISOString(),
      authorName: user?.name || 'Trainer',
      isAnswered: false,
    };
    
    const taskPath = `tasks/${taskId}`;
    const alertPath = 'alerts';
    try {
      const task = tasks.find(t => t.id === taskId);
      const updatedQuestions = [...(task?.questions || []), question];
      await updateDoc(doc(db, 'tasks', taskId), { questions: updatedQuestions });
      
      const alert: any = {
        recipientEmail: 'quinnledak@vastasports.com',
        subject: `Question regarding: ${selectedTask?.title}`,
        body: `Question from ${user?.name}: ${question.text}`,
        sentAt: new Date().toISOString(),
        status: 'sent',
      };
      await addDoc(collection(db, alertPath), alert);

      if (selectedTask?.id === taskId) {
        setSelectedTask({ ...selectedTask, questions: updatedQuestions });
      }
      setNewQuestion('');
      toast.success("Question sent to assigner");
    } catch (error) {
      if (error instanceof Error && error.message.includes('tasks')) {
        handleFirestoreError(error, OperationType.UPDATE, taskPath);
      } else {
        handleFirestoreError(error, OperationType.CREATE, alertPath);
      }
      toast.error("Failed to send question");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const path = `tasks/${taskId}`;
    try {
      // await deleteDoc(doc(db, 'tasks', taskId));
      toast.info("Delete functionality would go here");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
      toast.error("Failed to delete task");
    }
  };

  const handleSendAlert = async () => {
    if (!newAlert.recipientEmail || !newAlert.subject || !newAlert.body) {
      toast.error("Please fill in all fields");
      return;
    }

    const alert: any = {
      recipientEmail: newAlert.recipientEmail!,
      subject: newAlert.subject!,
      body: newAlert.body!,
      sentAt: new Date().toISOString(),
      status: 'sent',
    };

    const path = 'alerts';
    try {
      await addDoc(collection(db, path), alert);
      setIsNewAlertOpen(false);
      setNewAlert({ recipientEmail: '', subject: '', body: '' });
      toast.success("Email alert sent successfully");
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
      toast.error("Failed to send alert");
    }
  };

  const handleSendInvite = async () => {
    if (!newInvite.email || !newInvite.role) {
      toast.error("Please fill in all fields");
      return;
    }

    try {
      await addInvite(newInvite.email!, newInvite.role);
      setIsInviteOpen(false);
      setNewInvite({ email: '', role: 'trainer' });
    } catch (error) {
      // Error handled in context
    }
  };

  const draftAlertWithAI = async () => {
    if (!ai) {
      toast.error("Gemini API Key not configured");
      return;
    }

    if (!newAlert.subject) {
      toast.error("Please provide a subject first to help the AI draft the body");
      return;
    }

    setIsDrafting(true);
    try {
      if (!ai) return;
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Draft a professional and concise internal email for a personal training team. 
        Subject: ${newAlert.subject}
        Target Recipient: ${newAlert.recipientEmail || 'Team Member'}
        Context: Vasta Personal Training Management.
        Keep it professional, encouraging, and clear.`,
      });
      
      setNewAlert(prev => ({ ...prev, body: result.text || '' }));
      toast.success("Draft generated by AI");
    } catch (error) {
      console.error("AI Drafting Error:", error);
      toast.error("Failed to generate draft");
    } finally {
      setIsDrafting(false);
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
    <div className="min-h-screen bg-[#F8F9FB] flex font-sans text-slate-900">
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
            onClick={() => setActiveTab('alerts')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${activeTab === 'alerts' ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Bell className="w-5 h-5" />
            <span>Alerts Log</span>
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
              {activeTab === 'alerts' && 'Email Alerts History'}
            </h2>
            <p className="text-slate-500 mt-1">
              {activeTab === 'tasks' && 'Assign and track progress of team operations.'}
              {activeTab === 'team' && 'Manage trainers and their roles within the team.'}
              {activeTab === 'alerts' && 'Review all automated and manual alerts sent to the team.'}
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
                      value={newTask.title || ''}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea 
                      id="description" 
                      placeholder="Provide details about the task..." 
                      value={newTask.description || ''}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label>Assign To</Label>
                    <div className="grid grid-cols-2 gap-3 border rounded-lg p-3 max-h-[150px] overflow-y-auto">
                      {trainers.map(t => (
                        <div key={t.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`trainer-${t.id}`} 
                            checked={newTask.assignedTo.includes(t.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setNewTask({ ...newTask, assignedTo: [...newTask.assignedTo, t.id] });
                              } else {
                                setNewTask({ ...newTask, assignedTo: newTask.assignedTo.filter(id => id !== t.id) });
                              }
                            }}
                          />
                          <Label 
                            htmlFor={`trainer-${t.id}`}
                            className="text-xs font-medium cursor-pointer"
                          >
                            {t.name}
                          </Label>
                        </div>
                      ))}
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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="recurrence">Recurrence</Label>
                      <Select 
                        value={newTask.recurrenceInterval} 
                        onValueChange={(val) => setNewTask({ 
                          ...newTask, 
                          recurrenceInterval: val as RecurrenceInterval,
                          isRecurring: val !== 'none'
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">One-time</SelectItem>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
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

            <Dialog open={isNewAlertOpen} onOpenChange={setIsNewAlertOpen}>
              <DialogTrigger
                render={
                  <Button variant="outline" className="gap-2 border-slate-200 hover:bg-slate-50">
                    <Mail className="w-4 h-4" />
                    Send Alert
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Send Email Alert</DialogTitle>
                  <DialogDescription>
                    Send an internal email alert to team members. Use AI to help draft the content.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="recipient">Recipient Email</Label>
                    <Select 
                      value={newAlert.recipientEmail} 
                      onValueChange={(val) => setNewAlert({ ...newAlert, recipientEmail: val })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select trainer email" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="team@vasta.com">All Team Members</SelectItem>
                        {trainers.map(t => (
                          <SelectItem key={t.id} value={t.email}>{t.name} ({t.email})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="subject">Subject</Label>
                    <Input 
                      id="subject" 
                      placeholder="e.g. Urgent: Schedule Change" 
                      value={newAlert.subject || ''}
                      onChange={(e) => setNewAlert({ ...newAlert, subject: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-2">
                    <div className="flex justify-between items-center">
                      <Label htmlFor="body">Email Body</Label>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-1 text-xs"
                        onClick={draftAlertWithAI}
                        disabled={isDrafting}
                      >
                        {isDrafting ? (
                          <motion.div 
                            animate={{ rotate: 360 }} 
                            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                          >
                            <Sparkles className="w-3 h-3" />
                          </motion.div>
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        Draft with AI
                      </Button>
                    </div>
                    <Textarea 
                      id="body" 
                      placeholder="Write your message here..." 
                      className="min-h-[150px]"
                      value={newAlert.body || ''}
                      onChange={(e) => setNewAlert({ ...newAlert, body: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewAlertOpen(false)}>Cancel</Button>
                  <Button onClick={handleSendAlert} className="bg-red-600 hover:bg-red-700 gap-2">
                    <Send className="w-4 h-4" />
                    Send Now
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
                          onClick={() => setSelectedTask(task)}
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
                                  <DropdownMenuLabel>Move to</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'pending'); }}>Pending</DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'in-progress'); }}>In Progress</DropdownMenuItem>
                                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleUpdateTaskStatus(task.id, 'completed'); }}>Completed</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem 
                                    className="text-red-600"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id); }}
                                  >
                                    Delete Task
                                  </DropdownMenuItem>
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
                          <Button variant="ghost" size="sm" className="text-slate-400 hover:text-red-600">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
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
                              <Badge className="bg-amber-50 text-amber-700 border-amber-100 capitalize">
                                {invite.status}
                              </Badge>
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

          {activeTab === 'alerts' && (
            <motion.div 
              key="alerts"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-4"
            >
              {alerts.map((alert) => (
                <Card key={alert.id} className="border-slate-200 hover:border-red-200 transition-colors">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 p-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base font-bold">{alert.subject}</CardTitle>
                        <CardDescription className="text-xs flex items-center gap-2 mt-1">
                          <span className="font-medium text-slate-700">To: {alert.recipientEmail}</span>
                          <span className="text-slate-300">•</span>
                          <span>{format(new Date(alert.sentAt), 'MMM d, yyyy h:mm a')}</span>
                        </CardDescription>
                      </div>
                    </div>
                    <Badge className={alert.status === 'sent' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}>
                      {alert.status === 'sent' ? 'Delivered' : 'Failed'}
                    </Badge>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 ml-14">
                    <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-600 whitespace-pre-wrap border border-slate-100">
                      {alert.body}
                    </div>
                  </CardContent>
                </Card>
              ))}
              {alerts.length === 0 && (
                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 border-dashed">
                  <Mail className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-slate-900">No alerts sent yet</h3>
                  <p className="text-slate-500">When you send email alerts, they will appear here.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                  {selectedTask.isRecurring && (
                    <Badge variant="outline" className="capitalize flex items-center gap-1 border-red-100 text-red-600 bg-red-50">
                      <Repeat className="w-3 h-3" />
                      Recurring: {selectedTask.recurrenceInterval}
                    </Badge>
                  )}
                </div>
                <DialogTitle className="text-2xl font-bold">{selectedTask.title}</DialogTitle>
                <DialogDescription className="text-slate-500">
                  Created on {format(new Date(selectedTask.createdAt), 'MMMM d, yyyy')}
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-900">Description</h4>
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100">
                    {selectedTask.description || "No description provided."}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Assigned To</h4>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                        <AvatarImage src={trainers.find(t => t.id === selectedTask.assignedTo)?.photoURL || `https://picsum.photos/seed/${selectedTask.assignedTo}/100/100`} />
                        <AvatarFallback>{selectedTask.assignedToName[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-bold">{selectedTask.assignedToName}</p>
                        <p className="text-xs text-slate-500">Team Member</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-900">Due Date</h4>
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="w-4 h-4 text-red-500" />
                      <span className="text-sm font-medium">
                        {format(new Date(selectedTask.dueDate), 'MMMM d, yyyy')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-900 mb-3">Update Status</h4>
                  <div className="flex gap-2">
                    {(['pending', 'in-progress', 'completed'] as TaskStatus[]).map((status) => (
                      <Button
                        key={status}
                        variant={selectedTask.status === status ? 'default' : 'outline'}
                        size="sm"
                        className={`capitalize ${selectedTask.status === status ? 'bg-red-600 hover:bg-red-700' : ''}`}
                        onClick={() => handleUpdateTaskStatus(selectedTask.id, status)}
                      >
                        {status.replace('-', ' ')}
                      </Button>
                    ))}
                  </div>
                </div>

                <Tabs defaultValue="notes" className="w-full mt-2">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="notes" className="flex items-center gap-2">
                      <StickyNote className="w-4 h-4" />
                      Notes
                    </TabsTrigger>
                    <TabsTrigger value="questions" className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4" />
                      Questions
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="notes" className="space-y-4 pt-4">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Add a progress note..." 
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        className="text-xs"
                      />
                      <Button size="sm" onClick={() => handleAddNote(selectedTask.id)}>Add</Button>
                    </div>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                      {selectedTask.notes?.map((note) => (
                        <div key={note.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-slate-900">{note.authorName}</span>
                            <span className="text-[10px] text-slate-400">{format(new Date(note.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-xs text-slate-600">{note.text}</p>
                        </div>
                      ))}
                      {(!selectedTask.notes || selectedTask.notes.length === 0) && (
                        <p className="text-xs text-slate-400 text-center py-4 italic">No notes added yet.</p>
                      )}
                    </div>
                  </TabsContent>
                  <TabsContent value="questions" className="space-y-4 pt-4">
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Ask the assigner a question..." 
                        value={newQuestion}
                        onChange={(e) => setNewQuestion(e.target.value)}
                        className="text-xs"
                      />
                      <Button size="sm" onClick={() => handleAskQuestion(selectedTask.id)} variant="outline">
                        <Send className="w-3 h-3 mr-1" />
                        Ask
                      </Button>
                    </div>
                    <div className="space-y-3 max-h-[200px] overflow-y-auto pr-2">
                      {selectedTask.questions?.map((q) => (
                        <div key={q.id} className="bg-red-50/30 p-3 rounded-lg border border-red-100/50">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-red-900">{q.authorName}</span>
                            <span className="text-[10px] text-slate-400">{format(new Date(q.createdAt), 'MMM d, h:mm a')}</span>
                          </div>
                          <p className="text-xs text-slate-700">{q.text}</p>
                          {q.isAnswered && (
                            <div className="mt-2 pl-3 border-l-2 border-red-200">
                              <p className="text-[10px] font-bold text-slate-900">Answer:</p>
                              <p className="text-xs text-slate-600">{q.answer}</p>
                            </div>
                          )}
                        </div>
                      ))}
                      {(!selectedTask.questions || selectedTask.questions.length === 0) && (
                        <p className="text-xs text-slate-400 text-center py-4 italic">No questions asked yet.</p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <DialogFooter className="sm:justify-between items-center">
                <p className="text-[10px] text-slate-400">Task ID: {selectedTask.id}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedTask(null)}>Close</Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => handleDeleteTask(selectedTask.id)}
                  >
                    Delete Task
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
