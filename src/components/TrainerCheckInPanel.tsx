import React, { useState } from 'react';
import { 
  Plus, 
  Trash2, 
  History,
  ClipboardList,
  Award,
  Clock
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
import { Trainer, StaffCheckIn } from '../types';

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
}

export function TrainerCheckInPanel({ 
  trainer, 
  user, 
  onAddCheckIn, 
  onRemoveCheckIn 
}: TrainerCheckInPanelProps) {
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  
  // Local form states to isolate data for each individual trainer check-in
  const [checkInQuarter, setCheckInQuarter] = useState('Q2 2026');
  const [checkInDate, setCheckInDate] = useState(new Date().toISOString().split('T')[0]);
  const [checkInListen360Score, setCheckInListen360Score] = useState('');
  const [checkInRetentionRate, setCheckInRetentionRate] = useState('');
  const [checkInReferralsCollected, setCheckInReferralsCollected] = useState('');
  const [checkInSoapNotes, setCheckInSoapNotes] = useState('');
  const [checkInProgrammingNotes, setCheckInProgrammingNotes] = useState('');
  const [checkInBrainstormingFuture, setCheckInBrainstormingFuture] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50/40">
      {/* Left Column: Previous Reviews Menu */}
      <div className="lg:col-span-4 space-y-4">
        <h5 className="font-bold text-slate-800 flex items-center gap-2 text-xs border-b pb-2 uppercase tracking-wide">
          <History className="w-4 h-4 text-red-650" />
          Previous Reviews
        </h5>

        {(!trainer.checkIns || trainer.checkIns.length === 0) ? (
          <div className="border border-dashed border-slate-200 rounded-xl p-6 text-center bg-white">
            <p className="text-xs text-slate-505 text-slate-500 font-medium">No previous reviews logged.</p>
            <p className="text-[11px] text-slate-400 mt-1">First complete a check-in on the right.</p>
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
                    <span className="text-[11px] text-red-650 hover:underline inline-flex items-center gap-0.5 font-semibold animate-none">
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
                    <Plus className="w-3.5 h-3.5 text-slate-505 text-slate-500" />
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
                    <h6 className="text-[10px] font-bold text-slate-705 text-slate-700 uppercase tracking-wider mb-1">Programming Notes</h6>
                    <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed">{ci.programmingNotes || <span className="italic text-slate-400">No programming notes recorded</span>}</p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <h6 className="text-[10px] font-bold text-slate-705 text-slate-700 uppercase tracking-wider mb-1">Brainstorming for future</h6>
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
                  <Label htmlFor={`checkin-quarter-select-${trainer.id}`} className="text-[10px] text-slate-550 text-slate-500 font-bold block mb-1">Quarter</Label>
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
                  <Label htmlFor={`checkin-date-input-${trainer.id}`} className="text-[10px] text-slate-550 text-slate-500 font-bold block mb-1">Check-In Date</Label>
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
                className="text-xs h-8 text-slate-505 text-slate-500 hover:bg-slate-100"
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
  );
}
