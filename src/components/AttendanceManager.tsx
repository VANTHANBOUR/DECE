import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Student, 
  DailyAttendanceRecord, 
  AttendanceStatus, 
  StudentAttendanceItem, 
  Classroom,
  isAdminOrSuperAdmin,
  CAMPUS_LIST
} from '../types';
import { 
  UserCheck, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Calendar, 
  Users, 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Printer, 
  Plus, 
  Search, 
  Thermometer, 
  Phone, 
  FileText, 
  RotateCcw,
  Sparkles,
  School,
  Check,
  Building2,
  X,
  History
} from 'lucide-react';

export const AttendanceManager: React.FC = () => {
  const { 
    currentUser, 
    classrooms, 
    students, 
    addStudent,
    attendanceRecords, 
    saveAttendanceRecord, 
    selectedCampusId,
    formatAgeGroup,
    showToast,
    schoolProfile
  } = useApp();

  // 1. Determine assigned class for current user
  const teacherAssignedClass = useMemo(() => {
    if (!currentUser) return classrooms[0];
    if (currentUser.assignedClassId) {
      const match = classrooms.find(c => c.id === currentUser.assignedClassId);
      if (match) return match;
    }
    // Match by teacher lead ID
    const leadMatch = classrooms.find(c => c.leadTeacherId === currentUser.id);
    if (leadMatch) return leadMatch;
    // Match by name
    const nameMatch = classrooms.find(c => c.name.toLowerCase() === (currentUser.assignedClassName || '').toLowerCase());
    if (nameMatch) return nameMatch;
    return classrooms[0];
  }, [currentUser, classrooms]);

  // Filter classrooms by campus if selected
  const availableClassrooms = useMemo(() => {
    if (!selectedCampusId || selectedCampusId === 'ALL') return classrooms;
    return classrooms.filter(c => c.campusId === selectedCampusId);
  }, [classrooms, selectedCampusId]);

  // Active selected classroom
  const [selectedClassId, setSelectedClassId] = useState<string>(() => {
    return teacherAssignedClass?.id || classrooms[0]?.id || '';
  });

  // Keep in sync if classrooms update or teacher switches
  useEffect(() => {
    if (teacherAssignedClass && !selectedClassId) {
      setSelectedClassId(teacherAssignedClass.id);
    }
  }, [teacherAssignedClass]);

  const activeClassroom = useMemo(() => {
    return classrooms.find(c => c.id === selectedClassId) || teacherAssignedClass || classrooms[0];
  }, [classrooms, selectedClassId, teacherAssignedClass]);

  // 2. Date & Session Selection
  const todayStr = useMemo(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedSession, setSelectedSession] = useState<'full_day' | 'morning' | 'afternoon'>('full_day');

  // Search & Filter within the class roster
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all');
  const [activeSubTab, setActiveSubTab] = useState<'rollcall' | 'history'>('rollcall');

  // Modal for adding a new student to class
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentKhmerName, setNewStudentKhmerName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentGender, setNewStudentGender] = useState<'M' | 'F'>('M');
  const [newStudentDob, setNewStudentDob] = useState('');
  const [newStudentParent, setNewStudentParent] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentAllergies, setNewStudentAllergies] = useState('');

  // Print modal / sheet
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // 3. Students for current classroom
  const classStudents = useMemo(() => {
    if (!activeClassroom) return [];
    return students.filter(s => s.classId === activeClassroom.id);
  }, [students, activeClassroom]);

  // 4. Current Attendance Record ID
  const currentRecordId = useMemo(() => {
    if (!activeClassroom) return '';
    return `att_${activeClassroom.id}_${selectedDate}_${selectedSession}`;
  }, [activeClassroom, selectedDate, selectedSession]);

  // Existing saved record from store
  const existingRecord = useMemo(() => {
    return attendanceRecords.find(r => r.id === currentRecordId);
  }, [attendanceRecords, currentRecordId]);

  // Local working state for students attendance map: studentId -> StudentAttendanceItem
  const [rosterMap, setRosterMap] = useState<Record<string, StudentAttendanceItem>>({});
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Sync rosterMap when classStudents, selectedDate, or existingRecord changes
  useEffect(() => {
    if (existingRecord) {
      setRosterMap(existingRecord.records || {});
      setGeneralNotes(existingRecord.generalNotes || '');
    } else {
      // Default all enrolled students to 'present' with standard arrival time
      const initialMap: Record<string, StudentAttendanceItem> = {};
      classStudents.forEach(stu => {
        initialMap[stu.id] = {
          studentId: stu.id,
          studentName: stu.name,
          khmerName: stu.khmerName,
          rollNumber: stu.rollNumber,
          status: 'present',
          arrivalTime: '07:45 AM',
          temperature: '36.5°C',
          remarks: ''
        };
      });
      setRosterMap(initialMap);
      setGeneralNotes('');
    }
  }, [currentRecordId, existingRecord, classStudents]);

  // Update a single student's attendance item
  const updateStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setRosterMap(prev => {
      const current = prev[studentId] || {
        studentId,
        studentName: classStudents.find(s => s.id === studentId)?.name || 'Student',
        status: 'present'
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          status,
          arrivalTime: status === 'absent' ? undefined : (current.arrivalTime || '07:45 AM')
        }
      };
    });
  };

  const updateStudentField = (studentId: string, field: 'arrivalTime' | 'temperature' | 'remarks', val: string) => {
    setRosterMap(prev => {
      const current = prev[studentId] || {
        studentId,
        studentName: classStudents.find(s => s.id === studentId)?.name || 'Student',
        status: 'present'
      };
      return {
        ...prev,
        [studentId]: {
          ...current,
          [field]: val
        }
      };
    });
  };

  // Quick batch actions
  const markAllPresent = () => {
    setRosterMap(prev => {
      const updated = { ...prev };
      classStudents.forEach(stu => {
        updated[stu.id] = {
          ...(updated[stu.id] || { studentId: stu.id, studentName: stu.name }),
          status: 'present',
          arrivalTime: updated[stu.id]?.arrivalTime || '07:45 AM',
          temperature: updated[stu.id]?.temperature || '36.5°C'
        };
      });
      return updated;
    });
    showToast('Marked all students as Present', 'info');
  };

  const markAllAbsent = () => {
    setRosterMap(prev => {
      const updated = { ...prev };
      classStudents.forEach(stu => {
        updated[stu.id] = {
          ...(updated[stu.id] || { studentId: stu.id, studentName: stu.name }),
          status: 'absent',
          arrivalTime: undefined
        };
      });
      return updated;
    });
    showToast('Marked all students as Absent', 'warning');
  };

  const resetRoster = () => {
    const initialMap: Record<string, StudentAttendanceItem> = {};
    classStudents.forEach(stu => {
      initialMap[stu.id] = {
        studentId: stu.id,
        studentName: stu.name,
        khmerName: stu.khmerName,
        rollNumber: stu.rollNumber,
        status: 'present',
        arrivalTime: '07:45 AM',
        temperature: '36.5°C',
        remarks: ''
      };
    });
    setRosterMap(initialMap);
    showToast('Reset attendance sheet to default values', 'info');
  };

  // Computed summary metrics
  const summary = useMemo(() => {
    const total = classStudents.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;

    classStudents.forEach(stu => {
      const item = rosterMap[stu.id];
      const status = item?.status || 'present';
      if (status === 'present') present++;
      else if (status === 'absent') absent++;
      else if (status === 'late') late++;
      else if (status === 'excused') excused++;
    });

    const attendanceRate = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
    return {
      total,
      present,
      absent,
      late,
      excused,
      attendanceRate
    };
  }, [classStudents, rosterMap]);

  // Save handler
  const handleSaveAttendance = async () => {
    if (!currentUser || !activeClassroom) return;
    setIsSaving(true);
    try {
      await saveAttendanceRecord({
        id: currentRecordId,
        classId: activeClassroom.id,
        className: activeClassroom.name,
        campusId: activeClassroom.campusId,
        date: selectedDate,
        session: selectedSession,
        recordedByTeacherId: currentUser.id,
        recordedByTeacherName: currentUser.name,
        recordedByTeacherEmail: currentUser.email,
        totalStudents: summary.total,
        presentCount: summary.present,
        absentCount: summary.absent,
        lateCount: summary.late,
        excusedCount: summary.excused,
        attendanceRate: summary.attendanceRate,
        records: rosterMap,
        generalNotes: generalNotes.trim()
      });
    } catch (e) {
      console.error('Error saving attendance:', e);
      showToast('Error saving attendance record', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Date stepper
  const stepDate = (days: number) => {
    const curr = new Date(selectedDate);
    curr.setDate(curr.getDate() + days);
    setSelectedDate(curr.toISOString().split('T')[0]);
  };

  // Filtered student list for display
  const displayedStudents = useMemo(() => {
    return classStudents.filter(stu => {
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || 
        stu.name.toLowerCase().includes(q) || 
        (stu.khmerName && stu.khmerName.toLowerCase().includes(q)) ||
        stu.rollNumber.toLowerCase().includes(q);

      const status = rosterMap[stu.id]?.status || 'present';
      const matchStatus = statusFilter === 'all' || status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [classStudents, searchQuery, statusFilter, rosterMap]);

  // History records for current class
  const classHistoryRecords = useMemo(() => {
    if (!activeClassroom) return [];
    return attendanceRecords
      .filter(r => r.classId === activeClassroom.id)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceRecords, activeClassroom]);

  // Handle adding new student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !activeClassroom) return;

    const roll = newStudentRoll.trim() || `${activeClassroom.code || 'ST'}-${String(classStudents.length + 1).padStart(2, '0')}`;

    await addStudent({
      name: newStudentName.trim(),
      khmerName: newStudentKhmerName.trim(),
      rollNumber: roll,
      classId: activeClassroom.id,
      className: activeClassroom.name,
      campusId: activeClassroom.campusId,
      gender: newStudentGender,
      dob: newStudentDob || undefined,
      parentName: newStudentParent.trim() || undefined,
      parentPhone: newStudentPhone.trim() || undefined,
      allergiesOrMedical: newStudentAllergies.trim() || undefined,
      status: 'active'
    });

    // Reset form
    setNewStudentName('');
    setNewStudentKhmerName('');
    setNewStudentRoll('');
    setNewStudentDob('');
    setNewStudentParent('');
    setNewStudentPhone('');
    setNewStudentAllergies('');
    setIsAddStudentOpen(false);
  };

  const isMyAssignedClass = currentUser?.assignedClassId === activeClassroom?.id || 
    activeClassroom?.leadTeacherId === currentUser?.id ||
    activeClassroom?.name.toLowerCase() === (currentUser?.assignedClassName || '').toLowerCase();

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 bg-emerald-50 text-[#007A43] border border-emerald-200 rounded-xl">
                <UserCheck className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Daily Student Attendance · វត្តមានសិស្សប្រចាំថ្ងៃ
                  </h1>
                  {isMyAssignedClass && (
                    <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wide bg-emerald-50 text-[#007A43] border border-emerald-300">
                      Your Assigned Class
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Record trilingual attendance, early morning temperature checks, arrival logs, and absence remarks for early childhood compliance.
                </p>
              </div>
            </div>
          </div>

          {/* Quick Tab Switcher (Roll Call vs History) & Print */}
          <div className="flex items-center gap-2 self-start lg:self-center">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                onClick={() => setActiveSubTab('rollcall')}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activeSubTab === 'rollcall'
                    ? 'bg-white text-[#007A43] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Roll Call Sheet
              </button>
              <button
                onClick={() => setActiveSubTab('history')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-all ${
                  activeSubTab === 'history'
                    ? 'bg-white text-[#007A43] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Attendance Log ({classHistoryRecords.length})</span>
              </button>
            </div>

            <button
              onClick={() => setIsPrintModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-bold transition-all"
              title="Print official attendance roster"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">Print Roster</span>
            </button>
          </div>
        </div>

        {/* Controls Toolbar: Classroom, Date, Session */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
          {/* Classroom Selector */}
          <div className="md:col-span-4">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Selected Classroom
            </label>
            <div className="relative">
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="w-full pl-3 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs font-bold text-slate-900 transition-colors cursor-pointer"
              >
                {availableClassrooms.map(c => {
                  const isMine = currentUser?.assignedClassId === c.id || c.leadTeacherId === currentUser?.id;
                  return (
                    <option key={c.id} value={c.id}>
                      {c.name} ({formatAgeGroup(c.ageGroup)}) {isMine ? '★ [Assigned to You]' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Date Picker & Quick Navigation */}
          <div className="md:col-span-5">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Attendance Date
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => stepDate(-1)}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="flex-1 px-3 py-1.5 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-xs font-bold text-slate-900 transition-colors"
              />

              <button
                onClick={() => stepDate(1)}
                className="p-2 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl text-slate-700 transition-colors"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setSelectedDate(todayStr)}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                  selectedDate === todayStr 
                    ? 'bg-emerald-50 text-[#007A43] border-emerald-300 font-extrabold'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                Today
              </button>
            </div>
          </div>

          {/* Session Selector */}
          <div className="md:col-span-3">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Class Session
            </label>
            <select
              value={selectedSession}
              onChange={(e) => setSelectedSession(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-bold text-slate-900 transition-colors cursor-pointer"
            >
              <option value="full_day">Full Day (7:30 AM - 4:30 PM)</option>
              <option value="morning">Morning (7:30 AM - 11:30 AM)</option>
              <option value="afternoon">Afternoon (1:30 PM - 4:30 PM)</option>
            </select>
          </div>
        </div>
      </div>

      {activeSubTab === 'rollcall' ? (
        <>
          {/* KPI Metrics Dashboard Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total Enrolled */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span>Enrolled</span>
                <Users className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tabular-nums">
                  {summary.total}
                </span>
                <span className="text-xs text-slate-500 font-semibold">pupils</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">Classroom capacity</p>
            </div>

            {/* Present Count */}
            <div className="bg-white border border-emerald-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                <span>Present · វត្តមាន</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-700 tabular-nums">
                  {summary.present}
                </span>
                <span className="text-xs text-emerald-700 font-bold tabular-nums">
                  ({summary.total > 0 ? Math.round((summary.present / summary.total) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[11px] text-emerald-600 mt-1">In class & engaged</p>
            </div>

            {/* Absent Count */}
            <div className="bg-white border border-rose-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-rose-800 flex items-center justify-between">
                <span>Absent · អវត្តមាន</span>
                <XCircle className="w-4 h-4 text-rose-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-700 tabular-nums">
                  {summary.absent}
                </span>
                <span className="text-xs text-rose-700 font-bold tabular-nums">
                  ({summary.total > 0 ? Math.round((summary.absent / summary.total) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[11px] text-rose-600 mt-1">Not in attendance</p>
            </div>

            {/* Late Count */}
            <div className="bg-white border border-amber-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center justify-between">
                <span>Late · មកយឺត</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-amber-700 tabular-nums">
                  {summary.late}
                </span>
                <span className="text-xs text-amber-800 font-bold tabular-nums">
                  ({summary.total > 0 ? Math.round((summary.late / summary.total) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[11px] text-amber-700 mt-1">Delayed arrival</p>
            </div>

            {/* Excused Count */}
            <div className="bg-white border border-blue-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-900 flex items-center justify-between">
                <span>Excused · ច្បាប់</span>
                <AlertCircle className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2 flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-blue-700 tabular-nums">
                  {summary.excused}
                </span>
                <span className="text-xs text-blue-800 font-bold tabular-nums">
                  ({summary.total > 0 ? Math.round((summary.excused / summary.total) * 100) : 0}%)
                </span>
              </div>
              <p className="text-[11px] text-blue-700 mt-1">Parent notified / Sick</p>
            </div>

            {/* Overall Rate */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-300 rounded-2xl p-4 shadow-2xs">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#007A43]">
                Attendance Rate
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black text-[#007A43] tabular-nums">
                  {summary.attendanceRate}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[#007A43] transition-all duration-300"
                  style={{ width: `${summary.attendanceRate}%` }}
                />
              </div>
            </div>
          </div>

          {/* Action Toolbar & Filters */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Left: Quick Search and Status Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search student or roll #..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-semibold text-slate-800 transition-colors"
                />
              </div>

              {/* Status Filter buttons */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({classStudents.length})
                </button>
                <button
                  onClick={() => setStatusFilter('present')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'present' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  P ({summary.present})
                </button>
                <button
                  onClick={() => setStatusFilter('absent')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'absent' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  A ({summary.absent})
                </button>
                <button
                  onClick={() => setStatusFilter('late')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'late' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  L ({summary.late})
                </button>
                <button
                  onClick={() => setStatusFilter('excused')}
                  className={`px-2.5 py-1 rounded-lg transition-all ${
                    statusFilter === 'excused' ? 'bg-blue-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  E ({summary.excused})
                </button>
              </div>
            </div>

            {/* Right: Batch Actions, Add Student, Save */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={markAllPresent}
                className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#007A43] border border-emerald-300 rounded-xl text-xs font-bold transition-all"
                title="Mark all students present"
              >
                ✓ All Present
              </button>

              <button
                onClick={resetRoster}
                className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-xl transition-all"
                title="Reset roster"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setIsAddStudentOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Student</span>
              </button>

              <button
                onClick={handleSaveAttendance}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-[#007A43] hover:bg-[#006338] text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-amber-300" />
                <span>{isSaving ? 'Saving...' : existingRecord ? 'Update Attendance' : 'Save Attendance'}</span>
              </button>
            </div>
          </div>

          {/* Student Attendance Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-4 w-12 text-center">Roll #</th>
                    <th className="py-3 px-4 min-w-[200px]">Pupil Name & Details</th>
                    <th className="py-3 px-4 min-w-[280px]">Attendance Status · ស្ថានភាព</th>
                    <th className="py-3 px-3 w-32">Arrival Time</th>
                    <th className="py-3 px-3 w-28">Temp (°C)</th>
                    <th className="py-3 px-4 min-w-[220px]">Teacher Notes / Parent Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {displayedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">
                        <Users className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                        <p className="font-bold">No students found for this filter.</p>
                        <p className="text-[11px] mt-1 text-slate-400">Try changing your search query or click "Add Student" to register pupils.</p>
                      </td>
                    </tr>
                  ) : (
                    displayedStudents.map((student) => {
                      const item = rosterMap[student.id] || {
                        studentId: student.id,
                        studentName: student.name,
                        status: 'present',
                        arrivalTime: '07:45 AM',
                        temperature: '36.5°C'
                      };
                      const currentStatus = item.status;

                      return (
                        <tr 
                          key={student.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            currentStatus === 'absent' ? 'bg-rose-50/20' : currentStatus === 'late' ? 'bg-amber-50/20' : ''
                          }`}
                        >
                          {/* Roll Number */}
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-500 tabular-nums">
                            {student.rollNumber}
                          </td>

                          {/* Student Name & Info */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                student.gender === 'F' 
                                  ? 'bg-rose-100 text-rose-800' 
                                  : 'bg-blue-100 text-blue-800'
                              }`}>
                                {student.gender === 'F' ? '👧' : '👦'}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{student.name}</span>
                                  {student.allergiesOrMedical && (
                                    <span 
                                      className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded-md font-extrabold cursor-help"
                                      title={student.allergiesOrMedical}
                                    >
                                      Allergy
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-medium">
                                  {student.khmerName && <span className="text-slate-600 font-semibold">{student.khmerName} · </span>}
                                  <span>{student.gender === 'F' ? 'Female' : 'Male'}</span>
                                  {student.parentPhone && (
                                    <span className="text-slate-400 ml-1">· 📞 {student.parentPhone}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 4-Button Segmented Status Control */}
                          <td className="py-3 px-4">
                            <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200 gap-1">
                              {/* Present */}
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(student.id, 'present')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  currentStatus === 'present'
                                    ? 'bg-emerald-600 text-white shadow-xs font-black'
                                    : 'text-slate-600 hover:text-emerald-700 hover:bg-white/60'
                                }`}
                                title="Present · វត្តមាន"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>P · វត្តមាន</span>
                              </button>

                              {/* Absent */}
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(student.id, 'absent')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  currentStatus === 'absent'
                                    ? 'bg-rose-600 text-white shadow-xs font-black'
                                    : 'text-slate-600 hover:text-rose-700 hover:bg-white/60'
                                }`}
                                title="Absent · អវត្តមាន"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>A · អវត្តមាន</span>
                              </button>

                              {/* Late */}
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(student.id, 'late')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  currentStatus === 'late'
                                    ? 'bg-amber-500 text-white shadow-xs font-black'
                                    : 'text-slate-600 hover:text-amber-800 hover:bg-white/60'
                                }`}
                                title="Late · មកយឺត"
                              >
                                <Clock className="w-3.5 h-3.5" />
                                <span>L · យឺត</span>
                              </button>

                              {/* Excused */}
                              <button
                                type="button"
                                onClick={() => updateStudentStatus(student.id, 'excused')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  currentStatus === 'excused'
                                    ? 'bg-blue-600 text-white shadow-xs font-black'
                                    : 'text-slate-600 hover:text-blue-800 hover:bg-white/60'
                                }`}
                                title="Excused · ច្បាប់"
                              >
                                <AlertCircle className="w-3.5 h-3.5" />
                                <span>E · ច្បាប់</span>
                              </button>
                            </div>
                          </td>

                          {/* Arrival Time */}
                          <td className="py-3 px-3">
                            <input
                              type="text"
                              disabled={currentStatus === 'absent'}
                              value={currentStatus === 'absent' ? '--:--' : (item.arrivalTime || '07:45 AM')}
                              onChange={(e) => updateStudentField(student.id, 'arrivalTime', e.target.value)}
                              placeholder="07:45 AM"
                              className="w-full px-2.5 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg text-xs font-mono font-bold text-slate-800 transition-colors disabled:opacity-40 disabled:bg-slate-100"
                            />
                          </td>

                          {/* Temperature */}
                          <td className="py-3 px-3">
                            <div className="relative">
                              <input
                                type="text"
                                disabled={currentStatus === 'absent'}
                                value={currentStatus === 'absent' ? '--' : (item.temperature || '36.5°C')}
                                onChange={(e) => updateStudentField(student.id, 'temperature', e.target.value)}
                                placeholder="36.5°C"
                                className="w-full px-2.5 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg text-xs font-mono font-bold text-slate-800 transition-colors disabled:opacity-40 disabled:bg-slate-100"
                              />
                            </div>
                          </td>

                          {/* Remarks */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={item.remarks || ''}
                              onChange={(e) => updateStudentField(student.id, 'remarks', e.target.value)}
                              placeholder={
                                currentStatus === 'absent'
                                  ? 'Reason (e.g. sick at home, family trip)...'
                                  : currentStatus === 'late'
                                  ? 'Reason for delay...'
                                  : 'Health or behavior notes...'
                              }
                              className="w-full px-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-lg text-xs text-slate-800 placeholder:text-slate-400 transition-colors"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions & General Day Observation Notes */}
            <div className="p-4 sm:p-5 bg-slate-50/70 border-t border-slate-200 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              <div className="w-full md:max-w-xl">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Daily Classroom Observations & General Notes · កំណត់សម្គាល់ទូទៅ
                </label>
                <input
                  type="text"
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  placeholder="e.g., Morning circle had high participation; sensory water play activity completed safely; rainy dismissal..."
                  className="w-full px-3.5 py-2 bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs text-slate-800 transition-colors"
                />
              </div>

              <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-800">
                    {existingRecord ? `Last Saved: ${existingRecord.updatedAt.substring(0, 16).replace('T', ' ')}` : 'Unsaved draft'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Recorded by: {currentUser?.name || 'Educator'}
                  </p>
                </div>

                <button
                  onClick={handleSaveAttendance}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#007A43] hover:bg-[#006338] text-white rounded-xl text-xs font-bold shadow-xs transition-all active:scale-95 disabled:opacity-50"
                >
                  <Save className="w-4 h-4 text-amber-300" />
                  <span>{isSaving ? 'Saving Record...' : existingRecord ? 'Update Sheet' : 'Save Attendance'}</span>
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        /* History / Log View */
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Attendance Archive · {activeClassroom?.name}
              </h2>
              <p className="text-xs text-slate-500">
                Showing all saved daily attendance sheets for this classroom across academic term.
              </p>
            </div>
          </div>

          {classHistoryRecords.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <History className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="font-bold">No saved attendance records found for this classroom yet.</p>
              <p className="text-xs mt-1">Complete and save a roll call sheet to populate the archive.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase tracking-wider text-slate-600">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Session</th>
                    <th className="py-3 px-4 text-center">Enrolled</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-center">Late</th>
                    <th className="py-3 px-4 text-center">Excused</th>
                    <th className="py-3 px-4 text-center">Attendance %</th>
                    <th className="py-3 px-4">Recorded By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-semibold">
                  {classHistoryRecords.map(rec => (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {rec.date}
                      </td>
                      <td className="py-3 px-4 text-slate-700 capitalize">
                        {rec.session.replace('_', ' ')}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-slate-700">
                        {rec.totalStudents}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-emerald-700 font-bold">
                        {rec.presentCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-rose-700 font-bold">
                        {rec.absentCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-amber-700 font-bold">
                        {rec.lateCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums text-blue-700 font-bold">
                        {rec.excusedCount}
                      </td>
                      <td className="py-3 px-4 text-center tabular-nums">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md font-mono font-extrabold text-[11px] ${
                          rec.attendanceRate >= 85 
                            ? 'bg-emerald-100 text-emerald-800'
                            : rec.attendanceRate >= 70
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}>
                          {rec.attendanceRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-medium">
                        {rec.recordedByTeacherName}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedDate(rec.date);
                            setSelectedSession(rec.session);
                            setActiveSubTab('rollcall');
                          }}
                          className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-[#007A43] border border-emerald-300 rounded-lg text-xs font-bold transition-all"
                        >
                          View / Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Add Student Modal */}
      {isAddStudentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-emerald-50 text-[#007A43] rounded-xl border border-emerald-200">
                  <Plus className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Register New Pupil · {activeClassroom?.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Add pupil to active early childhood classroom roster
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddStudentOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Student Full Name (English) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Sokha Chan"
                    value={newStudentName}
                    onChange={(e) => setNewStudentName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Student Khmer Name (ឈ្មោះខ្មែរ)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., ចាន់ សុខា"
                    value={newStudentKhmerName}
                    onChange={(e) => setNewStudentKhmerName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-semibold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Roll Number
                  </label>
                  <input
                    type="text"
                    placeholder="Auto or e.g. PS-11"
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-mono font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={newStudentGender}
                    onChange={(e) => setNewStudentGender(e.target.value as 'M' | 'F')}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="M">Male (Boy)</option>
                    <option value="F">Female (Girl)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={newStudentDob}
                    onChange={(e) => setNewStudentDob(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Parent / Guardian Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Chan Vibol (Father)"
                    value={newStudentParent}
                    onChange={(e) => setNewStudentParent(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Parent Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+855 12 881 201"
                    value={newStudentPhone}
                    onChange={(e) => setNewStudentPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Allergies / Special Medical Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Mild peanut allergy; requires asthma inhaler..."
                  value={newStudentAllergies}
                  onChange={(e) => setNewStudentAllergies(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 focus:bg-white border border-slate-300 focus:border-emerald-500 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#007A43] hover:bg-[#006338] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
                >
                  Register Pupil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Official Printable Sheet View */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            {/* Modal Top Bar */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">Official Early Childhood Daily Attendance Record</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#007A43] hover:bg-[#006338] text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Document</span>
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content Container */}
            <div className="p-8 sm:p-10 space-y-6 text-slate-900 bg-white" id="attendance-print-area">
              {/* Institution Header */}
              <div className="text-center border-b-2 border-emerald-900 pb-5">
                <h3 className="font-serif text-sm font-bold text-slate-800 tracking-wider">
                  ព្រះរាជាណាចក្រកម្ពុជា · ជាតិ សាសនា ព្រះមហាក្សត្រ
                </h3>
                <h1 className="text-xl sm:text-2xl font-black text-[#006838] tracking-tight mt-2 uppercase">
                  {schoolProfile.schoolNameKhmer}
                </h1>
                <h2 className="text-sm font-extrabold text-slate-700 tracking-wider uppercase mt-0.5">
                  {schoolProfile.schoolNameEnglish}
                </h2>
                <div className="inline-block mt-3 px-4 py-1 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-black text-emerald-950 uppercase tracking-widest">
                  OFFICIAL DAILY STUDENT ATTENDANCE ROSTER · បញ្ជីវត្តមានសិស្សប្រចាំថ្ងៃ
                </div>
              </div>

              {/* Document Meta Information */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <span className="text-slate-500 font-bold block">Classroom / Level:</span>
                  <span className="font-extrabold text-slate-900">{activeClassroom?.name} ({activeClassroom?.code})</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Date:</span>
                  <span className="font-mono font-extrabold text-slate-900">{selectedDate}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Session:</span>
                  <span className="font-extrabold text-slate-900 capitalize">{selectedSession.replace('_', ' ')}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">Lead Teacher:</span>
                  <span className="font-extrabold text-slate-900">{activeClassroom?.leadTeacherName}</span>
                </div>
              </div>

              {/* Attendance Statistics Strip */}
              <div className="flex items-center justify-between p-3 border border-slate-300 rounded-xl text-xs font-bold bg-white">
                <div>Total: <span className="font-mono font-black">{summary.total}</span></div>
                <div className="text-emerald-700">Present: <span className="font-mono font-black">{summary.present}</span></div>
                <div className="text-rose-700">Absent: <span className="font-mono font-black">{summary.absent}</span></div>
                <div className="text-amber-700">Late: <span className="font-mono font-black">{summary.late}</span></div>
                <div className="text-blue-700">Excused: <span className="font-mono font-black">{summary.excused}</span></div>
                <div className="text-[#007A43]">Rate: <span className="font-mono font-black">{summary.attendanceRate}%</span></div>
              </div>

              {/* Table */}
              <table className="w-full text-left border-collapse border border-slate-300 text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold uppercase">
                    <th className="p-2 border-r border-slate-300 text-center w-12">Roll #</th>
                    <th className="p-2 border-r border-slate-300">Pupil Name</th>
                    <th className="p-2 border-r border-slate-300">Khmer Name</th>
                    <th className="p-2 border-r border-slate-300 text-center w-14">Gender</th>
                    <th className="p-2 border-r border-slate-300 text-center w-24">Status</th>
                    <th className="p-2 border-r border-slate-300 text-center w-20">Time</th>
                    <th className="p-2 border-r border-slate-300 text-center w-16">Temp</th>
                    <th className="p-2">Remarks / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {classStudents.map((stu) => {
                    const item = rosterMap[stu.id] || {
                      studentId: stu.id,
                      studentName: stu.name,
                      status: 'present'
                    };
                    return (
                      <tr key={stu.id} className="border-b border-slate-200">
                        <td className="p-2 border-r border-slate-300 text-center font-mono font-bold">{stu.rollNumber}</td>
                        <td className="p-2 border-r border-slate-300 font-bold">{stu.name}</td>
                        <td className="p-2 border-r border-slate-300 font-medium">{stu.khmerName || '-'}</td>
                        <td className="p-2 border-r border-slate-300 text-center">{stu.gender}</td>
                        <td className="p-2 border-r border-slate-300 text-center uppercase font-mono font-black">
                          {item.status}
                        </td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{item.arrivalTime || '-'}</td>
                        <td className="p-2 border-r border-slate-300 text-center font-mono">{item.temperature || '-'}</td>
                        <td className="p-2 text-slate-700">{item.remarks || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* General Day Notes */}
              {generalNotes && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                  <span className="font-bold block text-slate-700">Daily Observations / Remarks:</span>
                  <p className="text-slate-800 mt-1">{generalNotes}</p>
                </div>
              )}

              {/* Official Signatures Line */}
              <div className="pt-10 grid grid-cols-2 gap-8 text-center text-xs">
                <div className="space-y-16">
                  <p className="font-bold text-slate-700">
                    Lead Educator's Verification<br />
                    ហត្ថលេខាគ្រូបង្រៀនទទួលបន្ទុកថ្នាក់
                  </p>
                  <p className="font-bold text-slate-900 border-t border-slate-400 pt-2 inline-block min-w-[200px]">
                    {currentUser?.name || activeClassroom?.leadTeacherName}
                  </p>
                </div>

                <div className="space-y-16">
                  <p className="font-bold text-slate-700">
                    Academic Directorate / Principal Approval<br />
                    ការយល់ព្រមពីគណៈគ្រប់គ្រងសាលា
                  </p>
                  <p className="font-bold text-slate-900 border-t border-slate-400 pt-2 inline-block min-w-[200px]">
                    Madam Sopheak Rath · Principal
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
