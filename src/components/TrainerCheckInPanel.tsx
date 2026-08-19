import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  History, 
  ClipboardList, 
  Award, 
  Clock, 
  Calendar, 
  Mail, 
  CheckCircle2, 
  AlertCircle,
  Briefcase,
  CheckSquare,
  Square,
  UserCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '../../components/ui/select';
import { Badge } from '../../components/ui/badge';
import { Textarea } from '../../components/ui/textarea';
import { Checkbox } from '../../components/ui/checkbox';
import { Trainer, StaffCheckIn, StaffAnnualReview } from '../types';

interface TrainerCheckInPanelProps {
  trainer: Trainer;
  user: any;
  onAddCheckIn: (
    trainerId: string, 
    checkInQuarter: string,
    checkInDate: string,
    checkInListen360Score: string,
    checkInRetentionRate: string,
    checkInReferralsCollected: string,
    checkInSoapNotes: string,
    checkInProgrammingNotes: string,
    checkInBrainstormingFuture: string
  ) => Promise<void>;
  onRemoveCheckIn: (trainerId: string, checkInId: string) => Promise<void>;
  onToggleAnnualReviewStatus?: (
    trainerId: string,
    year: number,
    isCompleted: boolean,
    completionDate?: string,
    milestone?: string
  ) => Promise<void>;
  onAddAnnualReview?: (
    trainerId: string,
    review: {
      year: number;
      reviewDate: string;
      anniversaryMilestone: string;
      overallRating?: string;
      accomplishmentsNotes?: string;
      strengthsNotes?: string;
      growthOpportunitiesNotes?: string;
      goalSettingNotes?: string;
      compensationReviewNotes?: string;
      isCompleted?: boolean;
    }
  ) => Promise<void>;
  onRemoveAnnualReview?: (trainerId: string, reviewId: string) => Promise<void>;
  onSendAnnualReviewAlert?: (trainerId: string) => Promise<void>;
}

export function TrainerCheckInPanel({ 
  trainer, 
  user, 
  onAddCheckIn, 
  onRemoveCheckIn,
  onToggleAnnualReviewStatus,
  onAddAnnualReview,
  onRemoveAnnualReview,
  onSendAnnualReviewAlert
}: TrainerCheckInPanelProps) {
  const [activeReviewType, setActiveReviewType] = useState<'quarterly' | 'annual'>('quarterly');
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [updatingYear, setUpdatingYear] = useState<number | null>(null);
  const [customYearInput, setCustomYearInput] = useState('');
  
  // Quarterly Check-In Form States
  const [checkInQuarter, setCheckInQuarter] = useState('Q2 2026');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkInListen360Score, setCheckInListen360Score] = useState('');
  const [checkInRetentionRate, setCheckInRetentionRate] = useState('');
  const [checkInReferralsCollected, setCheckInReferralsCollected] = useState('');
  const [checkInSoapNotes, setCheckInSoapNotes] = useState('');
  const [checkInProgrammingNotes, setCheckInProgrammingNotes] = useState('');
  const [checkInBrainstormingFuture, setCheckInBrainstormingFuture] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentYear = new Date().getFullYear();

  // Calculate anniversary and 3-month-prior due date details
  const anniversaryDetails = (() => {
    if (!trainer.workAnniversary) return null;
    const parts = trainer.workAnniversary.split('-');
    if (parts.length < 2) return null;
    const startYear = parts.length === 3 ? parseInt(parts[0], 10) : null;
    const annivMonth = parts.length === 3 ? parseInt(parts[1], 10) : parseInt(parts[0], 10);
    const annivDay = parts.length === 3 ? parseInt(parts[2], 10) : parseInt(parts[1], 10);
    
    if (isNaN(annivMonth) || isNaN(annivDay)) return null;

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    
    const getOrdinalSuffix = (num: number) => {
      const j = num % 10, k = num % 100;
      if (j === 1 && k !== 11) return `${num}st`;
      if (j === 2 && k !== 12) return `${num}nd`;
      if (j === 3 && k !== 13) return `${num}rd`;
      return `${num}th`;
    };

    const getCycleDetails = (year: number) => {
      const annivUtc = new Date(Date.UTC(year, annivMonth - 1, annivDay));
      // Due date is 3 months prior to the anniversary
      const dueUtc = new Date(Date.UTC(year, annivMonth - 1 - 3, annivDay));
      const diffTimeToDue = dueUtc.getTime() - todayUtc.getTime();
      const diffDaysToDue = Math.round(diffTimeToDue / (1000 * 60 * 60 * 24));
      const diffTimeToAnniv = annivUtc.getTime() - todayUtc.getTime();
      const diffDaysToAnniv = Math.round(diffTimeToAnniv / (1000 * 60 * 60 * 24));
      const yearsOfService = startYear ? Math.max(1, year - startYear) : 1;
      return {
        year,
        diffDaysToDue,
        diffDaysToAnniv,
        yearsOfService,
        annivDateFormatted: new Date(year, annivMonth - 1, annivDay).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        }),
        dueDateFormatted: new Date(year, annivMonth - 1 - 3, annivDay).toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      };
    };

    const cycleCurrent = getCycleDetails(currentYear);
    const cycleNext = getCycleDetails(currentYear + 1);

    const isCurrentYearDone = (trainer.completedAnnualReviewYears || []).includes(currentYear) ||
      (trainer.annualReviews || []).some(r => r.year === currentYear && r.isCompleted !== false);

    // If current year review is already completed or its due date was more than 60 days in the past, focus on next cycle
    const activeCycle = (isCurrentYearDone || cycleCurrent.diffDaysToDue < -60) ? cycleNext : cycleCurrent;

    const isUpcomingDue = activeCycle.diffDaysToDue >= 0 && activeCycle.diffDaysToDue <= 30;
    const isPastDue = activeCycle.diffDaysToDue < 0;

    return {
      startYear,
      activeYear: activeCycle.year,
      yearsOfService: activeCycle.yearsOfService,
      annivDateFormatted: activeCycle.annivDateFormatted,
      dueDateFormatted: activeCycle.dueDateFormatted,
      diffDaysToDue: activeCycle.diffDaysToDue,
      diffDaysToAnniv: activeCycle.diffDaysToAnniv,
      isUpcomingDue,
      isPastDue,
      hireDateFormatted: startYear ? new Date(startYear, annivMonth - 1, annivDay).toLocaleDateString(undefined, {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }) : activeCycle.annivDateFormatted
    };
  })();

  const isCurrentYearReviewPerformed = (() => {
    if ((trainer.completedAnnualReviewYears || []).includes(currentYear)) return true;
    const review = (trainer.annualReviews || []).find(r => r.year === currentYear);
    return review ? review.isCompleted !== false : false;
  })();

  const handleResetForm = () => {
    setCheckInListen360Score('');
    setCheckInRetentionRate('');
    setCheckInReferralsCollected('');
    setCheckInSoapNotes('');
    setCheckInProgrammingNotes('');
    setCheckInBrainstormingFuture('');
  };

  const handleSave = async () => {
    setIsSubmitting(true);
    try {
      await onAddCheckIn(
        trainer.id,
        checkInQuarter,
        checkInDate,
        checkInListen360Score,
        checkInRetentionRate,
        checkInReferralsCollected,
        checkInSoapNotes,
        checkInProgrammingNotes,
        checkInBrainstormingFuture
      );
      handleResetForm();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleYear = async (year: number, isChecked: boolean, milestoneText?: string) => {
    setUpdatingYear(year);
    try {
      const milestone = milestoneText || `${year} Annual Review`;
      if (onToggleAnnualReviewStatus) {
        await onToggleAnnualReviewStatus(trainer.id, year, isChecked, new Date().toISOString().split('T')[0], milestone);
      } else if (onAddAnnualReview) {
        if (isChecked) {
          await onAddAnnualReview(trainer.id, {
            year,
            reviewDate: new Date().toISOString().split('T')[0],
            anniversaryMilestone: milestone,
            isCompleted: true
          });
        }
      }
    } finally {
      setUpdatingYear(null);
    }
  };

  const handleTriggerAlert = async () => {
    if (!onSendAnnualReviewAlert) return;
    setIsSendingAlert(true);
    try {
      await onSendAnnualReviewAlert(trainer.id);
    } finally {
      setIsSendingAlert(false);
    }
  };

  // Compile list of tracked years to display
  const yearsToTrack = (() => {
    const baseYears = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    if (anniversaryDetails?.startYear && anniversaryDetails.startYear < currentYear - 2) {
      baseYears.push(anniversaryDetails.startYear);
    }
    (trainer.annualReviews || []).forEach(r => {
      if (!baseYears.includes(r.year)) {
        baseYears.push(r.year);
      }
    });
    (trainer.completedAnnualReviewYears || []).forEach(y => {
      if (!baseYears.includes(y)) {
        baseYears.push(y);
      }
    });
    return Array.from(new Set(baseYears)).sort((a, b) => b - a);
  })();

  return (
    <div className="p-6 space-y-6 bg-slate-50/40">
      {/* Top Banner: Work Anniversary & Annual Review Status */}
      {anniversaryDetails && (
        <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          !isCurrentYearReviewPerformed && (anniversaryDetails.isUpcomingDue || anniversaryDetails.isPastDue)
            ? 'bg-amber-50/60 border-amber-200 shadow-sm'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`p-2.5 rounded-lg shrink-0 ${
              !isCurrentYearReviewPerformed && (anniversaryDetails.isUpcomingDue || anniversaryDetails.isPastDue)
                ? 'bg-amber-100 text-amber-800' 
                : 'bg-slate-100 text-slate-700'
            }`}>
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h5 className="font-bold text-slate-900 text-sm">
                  Annual Review Timing (Due 3 Months Prior to Anniversary)
                </h5>
                {isCurrentYearReviewPerformed ? (
                  <Badge className="bg-emerald-600 text-white font-semibold text-[10px] px-2 py-0.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {currentYear} Review Performed
                  </Badge>
                ) : (
                  <>
                    {anniversaryDetails.isUpcomingDue && (
                      <Badge className="bg-amber-600 text-white font-semibold text-[10px] px-2 py-0.5">
                        Due in {anniversaryDetails.diffDaysToDue} day{anniversaryDetails.diffDaysToDue === 1 ? '' : 's'}
                      </Badge>
                    )}
                    {anniversaryDetails.isPastDue && (
                      <Badge className="bg-red-600 text-white font-semibold text-[10px] px-2 py-0.5">
                        Review Past Due ({Math.abs(anniversaryDetails.diffDaysToDue)} days ago)
                      </Badge>
                    )}
                  </>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Work Anniversary: <strong>{anniversaryDetails.annivDateFormatted}</strong> • 
                <span className="text-red-700 font-semibold ml-1">Review Due Date (3 Mo Prior): <strong>{anniversaryDetails.dueDateFormatted}</strong></span>
                {trainer.location && <span> • Location: <strong className="text-slate-800">{trainer.location}</strong></span>}
              </p>
            </div>
          </div>

          {onSendAnnualReviewAlert && trainer.location && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSendingAlert}
              onClick={handleTriggerAlert}
              className="gap-2 bg-white hover:bg-slate-50 border-slate-300 text-xs font-semibold text-slate-700 shadow-sm shrink-0"
            >
              <Mail className="w-3.5 h-3.5 text-red-600" />
              {isSendingAlert ? 'Sending Alert...' : `Send Review Alert to ${trainer.location} Manager`}
            </Button>
          )}
        </div>
      )}

      {/* Review Type Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeReviewType === 'quarterly' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveReviewType('quarterly');
              setSelectedReviewId(null);
            }}
            className={`text-xs font-semibold gap-1.5 h-8 ${
              activeReviewType === 'quarterly' 
                ? 'bg-slate-900 text-white hover:bg-slate-800' 
                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            Quarterly Staff Check-Ins
            {trainer.checkIns && trainer.checkIns.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-slate-700 text-white text-[10px]">
                {trainer.checkIns.length}
              </span>
            )}
          </Button>

          <Button
            type="button"
            variant={activeReviewType === 'annual' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setActiveReviewType('annual');
            }}
            className={`text-xs font-semibold gap-1.5 h-8 ${
              activeReviewType === 'annual' 
                ? 'bg-red-600 text-white hover:bg-red-700' 
                : 'border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Annual Review Status
            {isCurrentYearReviewPerformed ? (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-700 text-white text-[10px] flex items-center gap-0.5">
                ✓ Done
              </span>
            ) : (
              <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px]">
                Pending
              </span>
            )}
          </Button>
        </div>

        <span className="text-xs text-slate-500 hidden sm:inline-block">
          Confidential: Location Managers & Staff Member Only
        </span>
      </div>

      {/* Mode 1: Quarterly Check-Ins */}
      {activeReviewType === 'quarterly' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Previous Reviews Menu */}
          <div className="lg:col-span-4 space-y-4">
            <h5 className="font-bold text-slate-800 flex items-center gap-2 text-xs border-b pb-2 uppercase tracking-wide">
              <History className="w-4 h-4 text-red-650" />
              Previous Quarterly Check-Ins
            </h5>

            {(!trainer.checkIns || trainer.checkIns.length === 0) ? (
              <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-white">
                <p className="text-xs text-slate-500 font-medium">No previous check-ins logged.</p>
                <p className="text-[11px] text-slate-400 mt-1">Complete a check-in on the right.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {trainer.checkIns.map((ci) => {
                  const isSelected = selectedReviewId === ci.id;
                  return (
                    <div 
                      key={ci.id}
                      onClick={() => setSelectedReviewId(isSelected ? null : ci.id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition-all duration-200 ${
                        isSelected 
                          ? 'bg-red-50/50 border-red-200 shadow-sm' 
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <Badge className="bg-slate-900 text-white font-bold text-[10px] px-1.5 py-0 h-4 rounded">
                            {ci.quarter}
                          </Badge>
                          <p className="text-[10px] text-slate-400 font-medium mt-1.5">
                            Date: {ci.checkInDate ? new Date(ci.checkInDate + 'T00:00:00').toLocaleDateString() : new Date(ci.createdAt).toLocaleDateString()}
                          </p>
                          <p className="text-[10px] text-slate-400 font-medium leading-none mt-1">
                            By: {ci.createdByName}
                          </p>
                        </div>
                        <div className="text-right">
                          {ci.listen360Score && (
                            <p className="text-[11px] font-semibold text-slate-700">Listen360: <span className="font-bold text-red-650">{ci.listen360Score}</span></p>
                          )}
                          {ci.retentionRate && (
                            <p className="text-[11px] font-semibold text-slate-700">Retention: <span className="font-bold text-blue-650">{ci.retentionRate}</span></p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center mt-3 pt-2 border-t border-dashed border-slate-100">
                        <span className="text-[11px] text-red-650 hover:underline inline-flex items-center gap-0.5 font-semibold">
                          {isSelected ? 'Collapse' : 'View full details →'}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveCheckIn(trainer.id, ci.id);
                            if (isSelected) {
                              setSelectedReviewId(null);
                            }
                          }}
                          className="h-6 w-6 p-0 text-slate-400 hover:text-red-650 rounded-md"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Active Form or Selected Review Details */}
          <div className="lg:col-span-8 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            {selectedReviewId ? (
              (() => {
                const ci = trainer.checkIns?.find(item => item.id === selectedReviewId);
                if (!ci) return null;
                return (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center border-b pb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <Badge className="bg-slate-900 text-white font-bold px-2 py-0.5 text-xs">
                            Quarterly Review - {ci.quarter}
                          </Badge>
                          {ci.checkInDate && (
                            <Badge variant="outline" className="text-slate-700 border-slate-300 bg-slate-50 text-[10px] px-2 py-0.5 h-auto">
                              Check-In Date: {new Date(ci.checkInDate + 'T00:00:00').toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          Conducted with trainer by <strong>{ci.createdByName}</strong> (Logged on: {new Date(ci.createdAt).toLocaleDateString()})
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setSelectedReviewId(null)}
                        className="text-xs border-slate-200 h-8 gap-1 focus-visible:ring-red-500"
                      >
                        <Plus className="w-3.5 h-3.5 text-slate-500" />
                        New Check-In
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 bg-red-50/20 border border-red-100 rounded-lg">
                        <p className="text-[9px] text-red-800 font-bold uppercase tracking-wider mb-1">Listen360 Score</p>
                        <p className="text-sm font-bold text-slate-800">{ci.listen360Score || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-blue-50/20 border border-blue-100 rounded-lg">
                        <p className="text-[9px] text-blue-800 font-bold uppercase tracking-wider mb-1">Quarterly Retention</p>
                        <p className="text-sm font-bold text-slate-800">{ci.retentionRate || 'N/A'}</p>
                      </div>
                      <div className="p-3 bg-amber-50/20 border border-amber-100 rounded-lg">
                        <p className="text-[9px] text-amber-800 font-bold uppercase tracking-wider mb-1">Referrals Collected</p>
                        <p className="text-sm font-bold text-slate-800">{ci.referralsCollected || 'N/A'}</p>
                      </div>
                    </div>

                    <div className="space-y-3.5 mt-2">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <h6 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">SOAP Notes (Subjective, Objective, Assessment, Plan)</h6>
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{ci.soapNotes || <span className="italic text-slate-400">No notes recorded</span>}</p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <h6 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Programming Notes</h6>
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{ci.programmingNotes || <span className="italic text-slate-400">No programming notes recorded</span>}</p>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                        <h6 className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Brainstorming for future</h6>
                        <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{ci.brainstormingFuture || <span className="italic text-slate-400">No brainstorming guidelines recorded</span>}</p>
                      </div>
                    </div>
                  </div>
                );
              })()
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b pb-3">
                  <div>
                    <h5 className="font-bold text-slate-900 text-[14px]">Conduct Quarterly Staff Check-In</h5>
                    <p className="text-xs text-slate-400 font-medium">This check-in is private to the trainer and managers only.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <div className="w-24 border-none shadow-none">
                      <Label htmlFor={`checkin-quarter-select-${trainer.id}`} className="text-[10px] text-slate-500 font-bold block mb-1">Quarter</Label>
                      <Select 
                        value={checkInQuarter} 
                        onValueChange={setCheckInQuarter}
                      >
                        <SelectTrigger id={`checkin-quarter-select-${trainer.id}`} className="h-8 text-xs border-slate-200">
                          <SelectValue placeholder="Quarter" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Q1 2025">Q1 2025</SelectItem>
                          <SelectItem value="Q2 2025">Q2 2025</SelectItem>
                          <SelectItem value="Q3 2025">Q3 2025</SelectItem>
                          <SelectItem value="Q4 2025">Q4 2025</SelectItem>
                          <SelectItem value="Q1 2026">Q1 2026</SelectItem>
                          <SelectItem value="Q2 2026">Q2 2026</SelectItem>
                          <SelectItem value="Q3 2026">Q3 2026</SelectItem>
                          <SelectItem value="Q4 2026">Q4 2026</SelectItem>
                          <SelectItem value="Q1 2027">Q1 2027</SelectItem>
                          <SelectItem value="Q2 2027">Q2 2027</SelectItem>
                          <SelectItem value="Q3 2027">Q3 2027</SelectItem>
                          <SelectItem value="Q4 2027">Q4 2027</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-36">
                      <Label htmlFor={`checkin-date-input-${trainer.id}`} className="text-[10px] text-slate-500 font-bold block mb-1">Check-In Date</Label>
                      <Input
                        id={`checkin-date-input-${trainer.id}`}
                        type="date"
                        value={checkInDate}
                        onChange={(e) => setCheckInDate(e.target.value)}
                        className="h-8 text-xs border-slate-200 focus-visible:ring-red-500 bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor={`listen360-${trainer.id}`} className="text-xs font-semibold text-slate-700">Listen360 Score</Label>
                    <Input 
                      id={`listen360-${trainer.id}`} 
                      placeholder="e.g. 9.5 or 10"
                      value={checkInListen360Score}
                      onChange={(e) => setCheckInListen360Score(e.target.value)}
                      className="h-9 border-slate-200 text-xs focus-visible:ring-red-500 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`retention-${trainer.id}`} className="text-xs font-semibold text-slate-700">Quarterly Retention</Label>
                    <Input 
                      id={`retention-${trainer.id}`} 
                      placeholder="e.g. 92% or High"
                      value={checkInRetentionRate}
                      onChange={(e) => setCheckInRetentionRate(e.target.value)}
                      className="h-9 border-slate-200 text-xs focus-visible:ring-red-500 bg-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`referrals-${trainer.id}`} className="text-xs font-semibold text-slate-700">Referrals Collected</Label>
                    <Input 
                      id={`referrals-${trainer.id}`} 
                      placeholder="e.g. 4 new clients"
                      value={checkInReferralsCollected}
                      onChange={(e) => setCheckInReferralsCollected(e.target.value)}
                      className="h-9 border-slate-200 text-xs focus-visible:ring-red-500 bg-white"
                    />
                  </div>
                </div>

                <div className="space-y-3 mt-1">
                  <div className="space-y-1">
                    <Label htmlFor={`soap-notes-${trainer.id}`} className="text-xs font-semibold text-slate-700">
                      SOAP Notes (Subjective, Objective, Assessment, Plan)
                    </Label>
                    <Textarea
                      id={`soap-notes-${trainer.id}`}
                      placeholder="Enter trainer review notes, physical therapy context, or overall performance observations..."
                      value={checkInSoapNotes}
                      onChange={(e) => setCheckInSoapNotes(e.target.value)}
                      className="min-h-[50px] text-xs focus-visible:ring-red-500 border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`prog-notes-${trainer.id}`} className="text-xs font-semibold text-slate-700">
                      Programming Notes
                    </Label>
                    <Textarea
                      id={`prog-notes-${trainer.id}`}
                      placeholder="Enter adjustments made to trainer's client/athlete programming or coaching guidelines..."
                      value={checkInProgrammingNotes}
                      onChange={(e) => setCheckInProgrammingNotes(e.target.value)}
                      className="min-h-[50px] text-xs focus-visible:ring-red-500 border-slate-200 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor={`brainstorming-${trainer.id}`} className="text-xs font-semibold text-slate-700">
                      Brainstorming for future
                    </Label>
                    <Textarea
                      id={`brainstorming-${trainer.id}`}
                      placeholder="Discuss goals, career steps, upcoming education or initiatives..."
                      value={checkInBrainstormingFuture}
                      onChange={(e) => setCheckInBrainstormingFuture(e.target.value)}
                      className="min-h-[50px] text-xs focus-visible:ring-red-500 border-slate-200 bg-white"
                    />
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                  <Button 
                    type="button"
                    variant="ghost" 
                    onClick={handleResetForm}
                    className="text-xs h-8 text-slate-500 hover:bg-slate-100"
                  >
                    Reset
                  </Button>
                  <Button 
                    type="button"
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="bg-red-600 hover:bg-red-700 h-8 text-xs font-semibold text-white px-4 shadow-sm"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Check-In'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Annual Review Checkbox Tracker */}
      {activeReviewType === 'annual' && (
        <div className="space-y-6">
          {/* Main Status & Current Year Review Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-red-600" />
                  Annual Performance Review Status
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Annual reviews are due <strong>3 months prior to the work anniversary</strong>. Check the box below once the review for the year has been performed.
                </p>
              </div>

              {anniversaryDetails && (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs font-semibold border-red-200 bg-red-50 text-red-700 py-1 px-2.5">
                    <Calendar className="w-3.5 h-3.5 mr-1 text-red-600" />
                    Due Date (3 Mo Prior): {anniversaryDetails.dueDateFormatted}
                  </Badge>
                  <Badge variant="outline" className="text-xs font-medium border-slate-200 bg-slate-50 text-slate-600 py-1 px-2.5">
                    Anniversary: {anniversaryDetails.annivDateFormatted}
                  </Badge>
                </div>
              )}
            </div>

            {/* Current Year Highlighted Checklist Card */}
            <div className={`p-5 rounded-xl border transition-all duration-200 ${
              isCurrentYearReviewPerformed
                ? 'bg-emerald-50/50 border-emerald-200'
                : (anniversaryDetails?.isUpcomingDue || anniversaryDetails?.isPastDue)
                  ? 'bg-amber-50/40 border-amber-200'
                  : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="pt-0.5">
                    <Checkbox
                      id={`annual-review-checkbox-${currentYear}`}
                      checked={isCurrentYearReviewPerformed}
                      disabled={updatingYear === currentYear}
                      onCheckedChange={(checked) => {
                        handleToggleYear(currentYear, !!checked);
                      }}
                      className="w-5 h-5 border-2 border-slate-400 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 rounded"
                    />
                  </div>

                  <div className="space-y-1">
                    <label 
                      htmlFor={`annual-review-checkbox-${currentYear}`}
                      className="font-bold text-slate-900 text-sm cursor-pointer flex flex-wrap items-center gap-2"
                    >
                      <span>{currentYear} Annual Review Performed</span>
                    </label>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      {isCurrentYearReviewPerformed ? (
                        <span className="text-emerald-700 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 inline" />
                          Annual review for {currentYear} has been completed and verified.
                          {(() => {
                            const rev = (trainer.annualReviews || []).find(r => r.year === currentYear);
                            if (rev?.completedByName || rev?.createdByName) {
                              return ` (Recorded by ${rev.completedByName || rev.createdByName})`;
                            }
                            return '';
                          })()}
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Review is pending for {currentYear}. Due date was/is <strong>{anniversaryDetails?.dueDateFormatted || '3 months prior to anniversary'}</strong>. Check this box once you have conducted the review with {trainer.name}.
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                  {isCurrentYearReviewPerformed ? (
                    <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs py-1 px-3">
                      ✓ Completed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-white border-amber-300 text-amber-800 font-semibold text-xs py-1 px-3 flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      Pending / Due
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* Historical Years Tracker */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h5 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <History className="w-4 h-4 text-slate-500" />
                  All Annual Review Years
                </h5>
                <span className="text-[11px] text-slate-400">
                  Click any checkbox to update the review completion status
                </span>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {yearsToTrack.map((year) => {
                  const isChecked = (trainer.completedAnnualReviewYears || []).includes(year) ||
                    (trainer.annualReviews || []).some(r => r.year === year && r.isCompleted !== false);
                  const revData = (trainer.annualReviews || []).find(r => r.year === year);
                  const isBusy = updatingYear === year;

                  return (
                    <div 
                      key={year}
                      className={`p-3.5 flex items-center justify-between gap-4 transition-colors ${
                        isChecked ? 'bg-emerald-50/20' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`annual-year-${year}`}
                          checked={isChecked}
                          disabled={isBusy}
                          onCheckedChange={(checked) => {
                            handleToggleYear(year, !!checked);
                          }}
                          className="w-4 h-4 border-slate-300 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 rounded"
                        />
                        <div>
                          <label 
                            htmlFor={`annual-year-${year}`}
                            className="text-xs font-bold text-slate-800 cursor-pointer flex items-center gap-2"
                          >
                            <span>{year} Review</span>
                            {year === currentYear && (
                              <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border-slate-300 bg-slate-100 text-slate-700 font-semibold">
                                Current Year
                              </Badge>
                            )}
                          </label>
                          <p className="text-[11px] text-slate-500">
                            {isChecked ? (
                              <span className="text-emerald-700 font-medium">
                                Performed {revData?.reviewDate || revData?.completedAt ? `on ${new Date((revData.reviewDate || revData.completedAt) + 'T00:00:00').toLocaleDateString()}` : ''}
                                {revData?.completedByName || revData?.createdByName ? ` by ${revData.completedByName || revData.createdByName}` : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Not marked as performed</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isChecked ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-none font-semibold text-[10px] px-2 py-0.5">
                            Performed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500 border-slate-200 text-[10px] px-2 py-0.5">
                            Pending
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Add Custom Year */}
            <div className="flex items-center gap-2 pt-1">
              <div className="w-32">
                <Input
                  type="number"
                  placeholder="e.g. 2023"
                  value={customYearInput}
                  onChange={(e) => setCustomYearInput(e.target.value)}
                  className="h-8 text-xs border-slate-200 bg-white"
                  min="2015"
                  max="2035"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const y = parseInt(customYearInput.trim(), 10);
                  if (!isNaN(y) && y >= 2015 && y <= 2035) {
                    handleToggleYear(y, true);
                    setCustomYearInput('');
                  }
                }}
                disabled={!customYearInput.trim() || updatingYear !== null}
                className="h-8 text-xs font-semibold text-slate-700 gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Add &amp; Check Off Year
              </Button>
            </div>

            {/* Footer Reminder Info */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-800">Automated Annual Review Alert Reminders</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                  Email reminder alerts are automatically sent to <strong>{trainer.location || 'assigned location'}</strong> location managers 30 days prior to the <strong>Review Due Date (which is 3 months prior to the employee's work anniversary)</strong> if the annual review has not yet been marked as completed. Once you check off the review above, no further automated reminders will be dispatched.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
