import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line 
} from 'recharts';
import { DollarSign, Users, BookOpen, TrendingUp, Trash2, PlusCircle, Loader2, Download, Edit2, AlertCircle, CheckCircle, Clock, X, UserCheck, UploadCloud, Database, Target, Trophy, ChevronDown, ChevronRight, PartyPopper, Search, ChevronLeft, AlertTriangle, Calendar, User, Activity, Building2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';

// Initialize Firebase OUTSIDE component
const firebaseConfig = {
  apiKey: "AIzaSyDFwSy_fQx1j_8LQK2LWxu6qqjN-Qm2rRw",
  authDomain: "training-dashboard-d984f.firebaseapp.com",
  projectId: "training-dashboard-d984f",
  storageBucket: "training-dashboard-d984f.firebasestorage.app",
  messagingSenderId: "841547478662",
  appId: "1:841547478662:web:575aa37097b17fecda4307"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Base Data
const BASE_DEPARTMENTS = [
  'Underwriting', 'Claims', 'Actuarial', 'Agency Sales', 'Direct Sales', 
  'Customer Service', 'Legal & Compliance', 'IT & Technology', 
  'HR & Training', 'Finance & Accounting', 'Operations', 'Marketing',
  'Risk Management', 'Internal Audit', 'Investment', 'Business Development'
];
const COMPANIES = ['PCHI', 'MSS']; 

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#14b8a6', '#f97316', '#64748b', '#0ea5e9',
  '#84cc16', '#eab308', '#d946ef', '#f43f5e', '#06b6d4'
];

// Helper: CSV Parser
const splitCSV = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Data States
  const [records, setRecords] = useState([]);
  const [annualBudget, setAnnualBudget] = useState(1000000);
  const [employeeMaster, setEmployeeMaster] = useState({});

  // UI States
  const [editingId, setEditingId] = useState(null);
  const [filterYear, setFilterYear] = useState('All');
  const [filterCompany, setFilterCompany] = useState('All'); 
  const [toast, setToast] = useState(null);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [showSpentBreakdown, setShowSpentBreakdown] = useState(false);
  
  // Search & Pagination States
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Delete & Profile States
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const fileInputRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    type: 'Training',
    course: '',
    date: '',
    totalCost: '',
    durationHours: '',
    attendees: [{ empId: '', name: '', company: 'PCHI', department: '', customDepartment: '' }]
  });

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            await signInAnonymously(auth);
          }
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Authentication Error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return; 

    const recordsRef = collection(db, 'training_records');
    const unsubRecords = onSnapshot(recordsRef, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      setRecords(data);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching records:", error);
      setIsLoading(false);
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'budget'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().annualBudget !== undefined) {
        setAnnualBudget(docSnap.data().annualBudget);
      }
    });

    const unsubEmp = onSnapshot(doc(db, 'settings', 'employee_master'), (docSnap) => {
      if (docSnap.exists() && docSnap.data().data) {
        setEmployeeMaster(docSnap.data().data);
      }
    });

    return () => { unsubRecords(); unsubSettings(); unsubEmp(); };
  }, [user]);

  const availableDepartments = useMemo(() => {
    const usedDepts = records.flatMap(r => {
      if (r.attendees) return r.attendees.map(a => a.department);
      if (r.allocations) return r.allocations.map(a => a.department);
      return [r.department];
    }).filter(Boolean);
    const uniqueDepts = Array.from(new Set([...BASE_DEPARTMENTS, ...usedDepts]));
    return uniqueDepts.sort();
  }, [records]);

  const availableYears = useMemo(() => {
    const years = records.map(r => r.date?.substring(0, 4)).filter(Boolean);
    return ['All', ...Array.from(new Set(years)).sort().reverse()];
  }, [records]);

  const filteredRecords = useMemo(() => {
    let result = records;
    if (filterYear !== 'All') {
      result = result.filter(r => r.date?.startsWith(filterYear));
    }
    return result;
  }, [records, filterYear]);

  const searchedRecords = useMemo(() => {
    if (!searchTerm.trim()) return filteredRecords;
    const lowerTerm = searchTerm.toLowerCase();
    return filteredRecords.filter(r => 
      r.course?.toLowerCase().includes(lowerTerm) ||
      r.date?.includes(lowerTerm) ||
      r.type?.toLowerCase().includes(lowerTerm)
    );
  }, [filteredRecords, searchTerm]);

  const totalPages = Math.ceil(searchedRecords.length / rowsPerPage) || 1;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterYear, filterCompany]);

  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return searchedRecords.slice(start, start + rowsPerPage);
  }, [searchedRecords, currentPage]);

  const duplicateEmpIds = useMemo(() => {
    const ids = formData.attendees.map(a => a.empId.trim()).filter(id => id !== '');
    const duplicates = ids.filter((item, index) => ids.indexOf(item) !== index);
    return new Set(duplicates);
  }, [formData.attendees]);

  // --- CORE METRICS & COMPANY FILTER LOGIC ---
  const metrics = useMemo(() => {
    let totalSpent = 0;
    let trainingSpent = 0;
    let engagementSpent = 0;
    let totalParticipants = 0;
    let totalLearningHours = 0;
    const deptStats = {};
    const uniqueAttendees = new Set();

    availableDepartments.forEach(d => {
      deptStats[d] = { name: d, spent: 0, participants: 0, hours: 0 };
    });

    filteredRecords.forEach(record => {
      const isEngagement = record.type === 'Engagement';
      const recordCost = Number(record.totalCost || record.cost || 0);
      const duration = isEngagement ? 0 : Number(record.durationHours || 0);
      
      let attendeesList = [];

      if (record.attendees && record.attendees.length > 0) {
        attendeesList = record.attendees;
      } else if (record.allocations) {
        record.allocations.forEach(alloc => {
          for(let i=0; i<Number(alloc.participants || 0); i++) {
            attendeesList.push({ company: 'PCHI', department: alloc.department, isLegacy: true });
          }
        });
      } else if (record.department) {
        for(let i=0; i<Number(record.participants || 0); i++) {
          attendeesList.push({ company: 'PCHI', department: record.department, isLegacy: true });
        }
      }

      const recordTotalParticipants = attendeesList.length;
      const costPerPerson = recordTotalParticipants > 0 ? (recordCost / recordTotalParticipants) : 0;

      let recordMatchingCost = 0;
      let recordMatchingParticipants = 0;

      attendeesList.forEach(person => {
        const pCompany = person.company || 'PCHI';
        
        if (filterCompany !== 'All' && pCompany !== filterCompany) return;

        recordMatchingCost += costPerPerson;
        recordMatchingParticipants += 1;

        const dept = person.department || 'Unknown';
        if (!deptStats[dept]) deptStats[dept] = { name: dept, spent: 0, participants: 0, hours: 0 };
        
        deptStats[dept].spent += costPerPerson;
        
        if (!isEngagement) {
          deptStats[dept].participants += 1;
          deptStats[dept].hours += duration;
          
          if (!person.isLegacy && (person.empId || person.name)) {
            const uniqueKey = `${person.empId?.trim() || ''}-${person.name?.trim() || ''}`.toLowerCase();
            if (uniqueKey !== '-') uniqueAttendees.add(uniqueKey);
          }
        }
      });

      totalSpent += recordMatchingCost;
      if (isEngagement) {
        engagementSpent += recordMatchingCost;
      } else {
        trainingSpent += recordMatchingCost;
        totalParticipants += recordMatchingParticipants;
        totalLearningHours += (duration * recordMatchingParticipants);
      }
    });

    const chartData = Object.values(deptStats).filter(d => d.participants > 0 || d.spent > 0);
    const pieData = chartData.filter(d => d.hours > 0); 

    return { totalSpent, trainingSpent, engagementSpent, totalParticipants, totalLearningHours, uniqueHeads: uniqueAttendees.size, chartData, pieData };
  }, [filteredRecords, availableDepartments, filterCompany]);

  const monthlyTrendData = useMemo(() => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data = months.map(m => ({ month: m, trainingSpent: 0, engagementSpent: 0, hours: 0 }));

    filteredRecords.forEach(record => {
      if (!record.date) return;
      const monthIndex = parseInt(record.date.split('-')[1], 10) - 1;
      
      if (monthIndex >= 0 && monthIndex < 12) {
        const isEngagement = record.type === 'Engagement';
        const cost = Number(record.totalCost || record.cost || 0);
        const duration = isEngagement ? 0 : Number(record.durationHours || 0);
        
        let attendeesList = record.attendees || [];
        if (!record.attendees) {
          const pax = record.allocations ? record.allocations.reduce((sum, a) => sum + Number(a.participants), 0) : Number(record.participants || 0);
          for(let i=0; i<pax; i++) attendeesList.push({ company: 'PCHI', isLegacy: true });
        }

        const costPerPerson = attendeesList.length > 0 ? (cost / attendeesList.length) : 0;
        
        let matchingCost = 0;
        let matchingPax = 0;

        attendeesList.forEach(person => {
          const pCompany = person.company || 'PCHI';
          if (filterCompany !== 'All' && pCompany !== filterCompany) return;
          matchingCost += costPerPerson;
          matchingPax += 1;
        });

        if (isEngagement) {
          data[monthIndex].engagementSpent += matchingCost;
        } else {
          data[monthIndex].trainingSpent += matchingCost;
          data[monthIndex].hours += (duration * matchingPax);
        }
      }
    });
    return data;
  }, [filteredRecords, filterCompany]);

  const leaderboard = useMemo(() => {
    const employeeStats = {};
    
    filteredRecords.forEach(record => {
      if (record.type === 'Engagement') return; 

      const duration = Number(record.durationHours || 0);
      if (record.attendees) {
        record.attendees.forEach(person => {
          const pCompany = person.company || 'PCHI';
          if (filterCompany !== 'All' && pCompany !== filterCompany) return;

          if (!person.isLegacy && (person.empId || person.name)) {
            const uniqueKey = `${person.empId?.trim() || ''}|${person.name?.trim() || ''}`;
            if (uniqueKey !== '|') {
              if (!employeeStats[uniqueKey]) {
                employeeStats[uniqueKey] = {
                  empId: person.empId,
                  name: person.name,
                  department: person.department,
                  company: pCompany,
                  totalHours: 0,
                  courses: 0
                };
              }
              employeeStats[uniqueKey].totalHours += duration;
              employeeStats[uniqueKey].courses += 1;
            }
          }
        });
      }
    });

    return Object.values(employeeStats)
      .sort((a, b) => b.totalHours - a.totalHours)
      .slice(0, 5);
  }, [filteredRecords, filterCompany]);

  const employeeProfileData = useMemo(() => {
    if (!selectedEmployee) return null;
    const { empId, name, department, company } = selectedEmployee;
    const history = [];
    let totalHrs = 0;
    let totalTrainings = 0;
    let totalEngagements = 0;

    filteredRecords.forEach(record => {
      if (!record.attendees) return; 
      
      const attended = record.attendees.find(a => 
        !a.isLegacy && ((empId && a.empId === empId) || (name && a.name === name))
      );

      if (attended) {
        const isEngagement = record.type === 'Engagement';
        const hrs = isEngagement ? 0 : Number(record.durationHours || 0);
        totalHrs += hrs;
        
        if (isEngagement) totalEngagements++;
        else totalTrainings++;

        history.push({
          date: record.date,
          course: record.course,
          type: record.type || 'Training',
          hours: hrs
        });
      }
    });
    
    history.sort((a,b) => new Date(b.date) - new Date(a.date));

    return {
      empId, name, department, company: company || 'PCHI',
      totalHours: totalHrs, totalTrainings, totalEngagements, history
    };
  }, [selectedEmployee, filteredRecords]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleAttendeeChange = (index, field, value) => {
    const newAttendees = [...formData.attendees];
    newAttendees[index][field] = value;

    if (field === 'empId') {
      if (value.trim() !== '') {
        const empData = employeeMaster[value.trim()];
        if (empData) {
          newAttendees[index].name = empData.name || '';
          newAttendees[index].company = empData.company || 'PCHI';
          if (availableDepartments.includes(empData.department)) {
            newAttendees[index].department = empData.department;
            newAttendees[index].customDepartment = '';
          } else {
            newAttendees[index].department = 'Other';
            newAttendees[index].customDepartment = empData.department || '';
          }
        }
      } else {
        // เมื่อลบ Emp ID จนว่างเปล่า ให้ล้างข้อมูลช่องอื่นเป็น Blank / Default
        newAttendees[index].name = '';
        newAttendees[index].company = 'PCHI';
        newAttendees[index].department = '';
        newAttendees[index].customDepartment = '';
      }
    } else if (field === 'name') {
      if (value.trim() !== '') {
        const matchedEntry = Object.entries(employeeMaster).find(
          ([id, data]) => data.name === value.trim()
        );
        if (matchedEntry) {
          const [empId, empData] = matchedEntry;
          newAttendees[index].empId = empId;
          newAttendees[index].company = empData.company || 'PCHI';
          if (availableDepartments.includes(empData.department)) {
            newAttendees[index].department = empData.department;
            newAttendees[index].customDepartment = '';
          } else {
            newAttendees[index].department = 'Other';
            newAttendees[index].customDepartment = empData.department || '';
          }
        }
      } else {
        // เมื่อลบ Name จนว่างเปล่า ให้ล้างข้อมูลช่องอื่นเป็น Blank / Default
        newAttendees[index].empId = '';
        newAttendees[index].company = 'PCHI';
        newAttendees[index].department = '';
        newAttendees[index].customDepartment = '';
      }
    }

    setFormData(prev => ({ ...prev, attendees: newAttendees }));
  };

  const addAttendee = () => {
    const lastDept = formData.attendees.length > 0 ? formData.attendees[formData.attendees.length - 1].department : '';
    const lastCompany = formData.attendees.length > 0 ? formData.attendees[formData.attendees.length - 1].company : 'PCHI';
    
    setFormData(prev => ({
      ...prev, attendees: [...prev.attendees, { empId: '', name: '', company: lastCompany, department: lastDept, customDepartment: '' }]
    }));
  };

  const removeAttendee = (index) => {
    const newAttendees = formData.attendees.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, attendees: newAttendees }));
  };

  const handleAddAllStaff = () => {
    if (Object.keys(employeeMaster).length === 0) {
      showToast("กรุณา Import ฐานข้อมูลพนักงานก่อนครับ", "warning");
      return;
    }
    
    const allStaff = Object.keys(employeeMaster).map(id => ({
      empId: id,
      name: employeeMaster[id].name,
      company: employeeMaster[id].company || 'PCHI',
      department: availableDepartments.includes(employeeMaster[id].department) ? employeeMaster[id].department : 'Other',
      customDepartment: availableDepartments.includes(employeeMaster[id].department) ? '' : employeeMaster[id].department
    }));

    setFormData(prev => ({ ...prev, attendees: allStaff }));
    showToast(`เพิ่มพนักงานทั้งหมด ${allStaff.length} คน เรียบร้อย!`);
  };

  const handleBudgetChange = (e) => setAnnualBudget(Number(e.target.value));

  const saveBudgetToCloud = async (newBudget) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'settings', 'budget'), { annualBudget: newBudget }, { merge: true });
      showToast("Budget updated successfully!");
    } catch (error) { console.error("Error saving budget", error); }
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000); 
  };

  const toggleRow = (id) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) newExpanded.delete(id);
    else newExpanded.add(id);
    setExpandedRows(newExpanded);
  };

  // --- ADVANCED IMPORT & FULL RETROACTIVE SYNC ---
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    showToast("กำลังประมวลผลไฟล์และอัปเดตข้อมูลเก่าแบบ Auto-Sync กรุณารอสักครู่...", "success");

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target.result;
        const rows = text.split(/\r?\n/);
        const empData = {};
        let count = 0;

        const headers = splitCSV(rows[0]).map(h => h.replace(/^"|"$/g, '').trim());
        const iId = headers.findIndex(h => h.includes('Employee No'));
        const iName = headers.findIndex(h => h.includes('Employee Name'));
        const iDept = headers.findIndex(h => h.includes('Organization Unit') || h.includes('Department'));
        const iComp = headers.findIndex(h => h.includes('Company'));

        const idxId = iId >= 0 ? iId : 0;
        const idxName = iName >= 0 ? iName : 1;
        const idxDept = iDept >= 0 ? iDept : 2;
        const idxComp = iComp >= 0 ? iComp : 4; 

        rows.forEach((row, i) => {
          if (i === 0 || !row.trim()) return; 
          
          const cols = splitCSV(row);
          if (cols.length > Math.max(idxId, idxName)) {
            const id = cols[idxId].replace(/^"|"$/g, '').trim();
            if (!id) return;
            
            empData[id] = { 
              name: cols[idxName].replace(/^"|"$/g, '').trim(), 
              department: cols[idxDept] ? cols[idxDept].replace(/^"|"$/g, '').trim() : 'Unknown',
              company: cols[idxComp] ? cols[idxComp].replace(/^"|"$/g, '').trim().toUpperCase() : 'PCHI'
            };
            count++;
          }
        });

        // 1. อัปเดต Master Data เข้า Firebase
        await setDoc(doc(db, 'settings', 'employee_master'), { data: empData });
        
        // 2. RETROACTIVE SYNC: วิ่งกลับไปเช็คคอร์สเก่าๆ ทั้งหมด
        let updatedRecordsCount = 0;
        const updatePromises = [];
        
        records.forEach(record => {
          let needsUpdate = false;
          if (record.attendees && record.attendees.length > 0) {
            
            const newAttendees = record.attendees.map(att => {
              const empIdVal = att.empId?.trim();
              const nameVal = att.name?.trim();
              
              let masterInfo = null;
              let matchedId = empIdVal;

              // หาจาก ID ก่อน ถ้าไม่เจอ หาจากชื่อ
              if (empIdVal && empData[empIdVal]) {
                masterInfo = empData[empIdVal];
              } else if (nameVal) {
                const entry = Object.entries(empData).find(([id, data]) => data.name === nameVal);
                if (entry) {
                  matchedId = entry[0];
                  masterInfo = entry[1];
                }
              }

              if (masterInfo) {
                // ถ้าในคอร์สเก่า ค่าไม่ตรงกับไฟล์ Master ล่าสุด ให้สั่งจับอัปเดต!
                if (att.company !== masterInfo.company || 
                    att.department !== masterInfo.department || 
                    att.name !== masterInfo.name ||
                    att.empId !== matchedId) {
                  needsUpdate = true;
                  return {
                    ...att,
                    empId: matchedId,
                    name: masterInfo.name,
                    company: masterInfo.company,
                    department: masterInfo.department,
                    customDepartment: '' 
                  };
                }
              }
              return att;
            });
            
            if (needsUpdate) {
              const updatedRecord = { ...record, attendees: newAttendees };
              const docRef = doc(db, 'training_records', record.id);
              updatePromises.push(setDoc(docRef, updatedRecord));
              updatedRecordsCount++;
            }
          }
        });
        
        if (updatePromises.length > 0) {
          await Promise.all(updatePromises);
          showToast(`นำเข้าสำเร็จ ${count} คน และอัปเดตประวัติเก่าย้อนหลังให้ตรงกัน ${updatedRecordsCount} คอร์ส!`);
        } else {
          showToast(`นำเข้าสำเร็จ ${count} คน! (ข้อมูลประวัติเก่าเป็นปัจจุบันอยู่แล้ว)`);
        }
        
        if (fileInputRef.current) fileInputRef.current.value = ''; 
      } catch (err) {
        console.error("Error parsing CSV:", err);
        showToast("รูปแบบไฟล์ไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง", "error");
      }
    };
    reader.readAsText(file);
  };

  const exportToCSV = () => {
    const headers = ['Date', 'Type', 'Activity/Course', 'Duration (Hrs)', 'Total Seats', 'Total Cost (THB)', 'Attendee Details (ID/Name/Company/Dept)'];
    const rows = filteredRecords.map(r => {
      const type = r.type || 'Training';
      const cost = r.totalCost || r.cost || 0;
      const duration = type === 'Engagement' ? 0 : (r.durationHours || 0);
      let seats = 0;
      let details = "Legacy Format";

      if (r.attendees) {
        seats = r.attendees.length;
        details = r.attendees.map(a => `[${a.company || 'PCHI'}] [${a.empId||'-'}] ${a.name||'-'} (${a.department})`).join(" | ");
      } else if (r.allocations) {
        seats = r.allocations.reduce((sum, a) => sum + Number(a.participants), 0);
        details = r.allocations.map(a => `${a.department} (${a.participants} pax)`).join(" | ");
      }

      return [r.date, type, `"${r.course}"`, duration, seats, cost, `"${details}"`];
    });
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `budget_report_${filterYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported to CSV!");
  };

  const handleEditClick = (record) => {
    let initialAttendees = [];
    if (record.attendees) {
      initialAttendees = record.attendees.map(a => ({...a, customDepartment: ''}));
    } else if (record.allocations) {
      record.allocations.forEach(alloc => {
        for(let i=0; i<Number(alloc.participants || 0); i++) {
          initialAttendees.push({ empId: '', name: 'Legacy Data', company: 'PCHI', department: alloc.department, customDepartment: '' });
        }
      });
    }

    setFormData({
      type: record.type || 'Training',
      course: record.course || '',
      date: record.date || '',
      totalCost: record.totalCost || record.cost || '',
      durationHours: record.durationHours || '',
      attendees: initialAttendees.length > 0 ? initialAttendees : [{ empId: '', name: '', company: 'PCHI', department: '', customDepartment: '' }]
    });
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setFormData({
      type: 'Training',
      course: '', date: '', totalCost: '', durationHours: '',
      attendees: [{ empId: '', name: '', company: 'PCHI', department: '', customDepartment: '' }]
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.course || !formData.totalCost || !formData.date) return;
    
    if (duplicateEmpIds.size > 0) {
      showToast("พบรหัสพนักงานซ้ำในรายการ กรุณาตรวจสอบ", "error");
      return;
    }

    const validAttendees = [];
    for (let a of formData.attendees) {
      if (a.name.trim() !== '' || a.empId.trim() !== '') {
        if (!a.department || a.department === '') {
          showToast("กรุณาเลือกแผนกให้ครบทุกคน", "error");
          return;
        }
        const finalDepartment = a.department === 'Other' ? (a.customDepartment.trim() || 'Unknown') : a.department;
        validAttendees.push({
          empId: a.empId.trim(),
          name: a.name.trim(),
          company: a.company || 'PCHI',
          department: finalDepartment
        });
      }
    }

    if (validAttendees.length === 0) {
      showToast("กรุณาระบุรายชื่อผู้เข้าร่วมอย่างน้อย 1 คน", "error");
      return;
    }

    const recordId = editingId || Date.now().toString();
    const newRecord = {
      type: formData.type,
      course: formData.course,
      date: formData.date,
      totalCost: Number(formData.totalCost),
      durationHours: formData.type === 'Engagement' ? 0 : Number(formData.durationHours || 0),
      attendees: validAttendees
    };
    
    const currentCost = editingId ? (records.find(r => r.id === editingId)?.totalCost || records.find(r => r.id === editingId)?.cost || 0) : 0;
    const willExceedBudget = (metrics.totalSpent - currentCost + newRecord.totalCost) > annualBudget;

    try {
      await setDoc(doc(db, 'training_records', recordId), newRecord);
      resetForm();
      if (willExceedBudget) showToast("Record saved, but warning: Budget exceeded!", "warning");
      else showToast(editingId ? "Record updated successfully!" : "Record added successfully!");
    } catch (error) {
      console.error("Error saving record:", error);
      showToast("Error saving record", "error");
    }
  };

  const confirmDelete = async () => {
    if (!user || !recordToDelete) return;
    try {
      await deleteDoc(doc(db, 'training_records', recordToDelete));
      showToast("Record deleted successfully.");
      setRecordToDelete(null); 
    } catch (error) { 
      console.error("Error deleting record:", error); 
      showToast("Error deleting record", "error");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <h2 className="text-xl font-medium text-slate-700">Connecting to secure cloud storage...</h2>
      </div>
    );
  }

  const loadedEmployeesCount = Object.keys(employeeMaster).length;

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800 relative">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === 'warning' ? 'bg-amber-500' : toast.type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} transition-opacity duration-300`}>
          {toast.type === 'warning' ? <AlertCircle size={20} className="mr-2" /> : toast.type === 'error' ? <AlertTriangle size={20} className="mr-2" /> : <CheckCircle size={20} className="mr-2" />}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {recordToDelete && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-red-50 p-4 flex items-center justify-center border-b border-red-100">
              <div className="bg-red-100 p-3 rounded-full text-red-600">
                <AlertTriangle size={32} />
              </div>
            </div>
            <div className="p-6 text-center space-y-2">
              <h3 className="text-xl font-bold text-slate-800">ยืนยันการลบข้อมูล?</h3>
              <p className="text-sm text-slate-500">ข้อมูลที่ถูกลบจะไม่สามารถกู้คืนได้ คุณแน่ใจหรือไม่ที่จะลบรายการนี้?</p>
            </div>
            <div className="p-4 bg-slate-50 flex gap-3 border-t border-slate-100">
              <button 
                onClick={() => setRecordToDelete(null)}
                className="flex-1 px-4 py-2 font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
              >
                ยกเลิก (Cancel)
              </button>
              <button 
                onClick={confirmDelete}
                className="flex-1 px-4 py-2 font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors shadow-sm"
              >
                ยืนยันลบ (Delete)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Profile Modal */}
      {selectedEmployee && employeeProfileData && (
        <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white relative flex-shrink-0">
              <button onClick={() => setSelectedEmployee(null)} className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded-full transition-colors">
                <X size={18} />
              </button>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center border-2 border-white/30 backdrop-blur-sm flex-shrink-0">
                  <User size={32} className="text-white" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold truncate">{employeeProfileData.name || 'Unknown Name'}</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm mt-1">
                    <span className="bg-blue-800/50 px-2 py-0.5 rounded font-mono">{employeeProfileData.empId || 'NO-ID'}</span>
                    <span className={`px-2 py-0.5 rounded font-bold text-xs ${employeeProfileData.company === 'MSS' ? 'bg-emerald-500/80' : 'bg-indigo-500/80'}`}>
                      {employeeProfileData.company}
                    </span>
                    <span className="text-blue-100 truncate">{employeeProfileData.department}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex bg-slate-50 border-b border-slate-100 flex-shrink-0">
              <div className="flex-1 p-4 text-center border-r border-slate-200">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Learning Hours</p>
                <p className="text-2xl font-bold text-indigo-600">{employeeProfileData.totalHours} <span className="text-sm font-normal text-slate-500">h</span></p>
              </div>
              <div className="flex-1 p-4 text-center border-r border-slate-200">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Trainings</p>
                <p className="text-2xl font-bold text-slate-700">{employeeProfileData.totalTrainings}</p>
              </div>
              <div className="flex-1 p-4 text-center">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Engagements</p>
                <p className="text-2xl font-bold text-pink-600">{employeeProfileData.totalEngagements}</p>
              </div>
            </div>

            <div className="p-0 overflow-y-auto flex-1 bg-slate-50">
              <div className="p-4 border-b border-slate-100 bg-white sticky top-0 z-10 shadow-sm">
                <h3 className="font-bold text-slate-700 flex items-center text-sm">
                  <Activity size={16} className="mr-2 text-blue-500" /> Activity History
                </h3>
              </div>
              <ul className="p-4 space-y-3">
                {employeeProfileData.history.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-sm">ไม่มีประวัติการเข้าร่วม</p>
                ) : (
                  employeeProfileData.history.map((hist, idx) => (
                    <li key={idx} className="bg-white border border-slate-200 rounded-xl p-3 flex items-start gap-3 hover:shadow-md transition-shadow">
                      <div className={`p-2 rounded-lg mt-1 flex-shrink-0 ${hist.type === 'Engagement' ? 'bg-pink-50 text-pink-500' : 'bg-blue-50 text-blue-500'}`}>
                        {hist.type === 'Engagement' ? <PartyPopper size={16} /> : <BookOpen size={16} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate" title={hist.course}>{hist.course}</p>
                        <p className="text-xs text-slate-500 flex items-center mt-1">
                          <Calendar size={12} className="mr-1" /> {hist.date}
                        </p>
                      </div>
                      {hist.type !== 'Engagement' && (
                        <div className="text-right flex-shrink-0">
                          <span className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded text-xs font-bold border border-emerald-100">
                            +{hist.hours} h
                          </span>
                        </div>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Header & Global Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center">
              Training Dashboard
            </h1>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              Track multi-company spending & learning hours 
              <span className="text-blue-500 font-medium text-sm border-l border-slate-300 pl-2">Live Auto-Save ON</span>
              {loadedEmployeesCount > 0 && (
                <span className="text-emerald-600 font-medium text-sm flex items-center border-l border-slate-300 pl-2">
                  <Database size={14} className="mr-1" /> {loadedEmployeesCount} Employees
                </span>
              )}
            </p>
          </div>
          
          {/* Global Controls */}
          <div className="flex flex-wrap items-center gap-3">
            
            {/* Company Filter */}
            <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center">
              <Building2 size={16} className="text-slate-400 mr-2" />
              <select 
                value={filterCompany} 
                onChange={(e) => setFilterCompany(e.target.value)}
                className="bg-transparent text-sm font-bold text-indigo-700 focus:outline-none cursor-pointer"
              >
                <option value="All">All Companies</option>
                {COMPANIES.map(company => (
                  <option key={company} value={company}>{company} Only</option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center">
              <Calendar size={16} className="text-slate-400 mr-2" />
              <select 
                value={filterYear} 
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                {availableYears.map(year => (
                  <option key={year} value={year}>{year === 'All' ? 'All Time' : `${year} Year`}</option>
                ))}
              </select>
            </div>
            
            {/* Budget Input */}
            <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <label className="text-sm font-medium text-slate-500">Total Budget:</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">฿</span>
                <input 
                  type="number" 
                  value={annualBudget} 
                  onChange={handleBudgetChange}
                  onBlur={(e) => saveBudgetToCloud(Number(e.target.value))}
                  className="w-28 pl-7 pr-2 py-1.5 text-right font-bold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start space-x-3">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg mt-0.5"><DollarSign size={20} /></div>
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold text-slate-500 uppercase">Total Spent</p>
                  <h3 className="text-lg font-bold text-slate-800">฿{Math.round(metrics.totalSpent).toLocaleString()}</h3>
                </div>
                <button 
                  onClick={() => setShowSpentBreakdown(!showSpentBreakdown)}
                  className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors mt-0.5"
                  title="ดูรายละเอียดแยกตามประเภท"
                >
                  {showSpentBreakdown ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
              
              {showSpentBreakdown && (
                <div className="mt-2 pt-2 border-t border-slate-100 space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-medium flex items-center"><BookOpen size={10} className="mr-1 text-blue-400"/> Train:</span>
                    <span className="font-bold text-blue-600">฿{Math.round(metrics.trainingSpent).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500 font-medium flex items-center"><PartyPopper size={10} className="mr-1 text-pink-400"/> Engage:</span>
                    <span className="font-bold text-pink-600">฿{Math.round(metrics.engagementSpent).toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 text-emerald-600 rounded-lg"><TrendingUp size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Remaining Budget</p>
              <h3 className={`text-lg font-bold ${annualBudget - metrics.totalSpent < 0 ? 'text-red-500' : 'text-slate-800'}`}>
                ฿{Math.round(annualBudget - metrics.totalSpent).toLocaleString()}
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-pink-100 text-pink-600 rounded-lg"><UserCheck size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Unique Trained</p>
              <h3 className="text-lg font-bold text-slate-800">{metrics.uniqueHeads} <span className="text-xs font-normal text-slate-500">Heads</span></h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Users size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Training Seats</p>
              <h3 className="text-lg font-bold text-slate-800">{metrics.totalParticipants}</h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Clock size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Learning Hours</p>
              <h3 className="text-lg font-bold text-slate-800">{metrics.totalLearningHours.toLocaleString()}</h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-cyan-100 text-cyan-600 rounded-lg"><Target size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Avg Hrs/Person</p>
              <h3 className="text-lg font-bold text-slate-800">
                {metrics.uniqueHeads ? (metrics.totalLearningHours / metrics.uniqueHeads).toFixed(1) : 0} <span className="text-xs font-normal text-slate-500">Hrs</span>
              </h3>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg"><BookOpen size={20} /></div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Cost/Seat (Train)</p>
              <h3 className="text-lg font-bold text-slate-800">
                ฿{metrics.totalParticipants ? Math.round(metrics.trainingSpent / metrics.totalParticipants).toLocaleString() : 0}
              </h3>
            </div>
          </div>
        </div>

        {/* Charts Section - Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2 flex flex-col">
            <h3 className="text-lg font-bold mb-4">Proportional Spent by Department (THB)</h3>
            <div className="h-[360px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.chartData} margin={{ top: 20, right: 30, left: 20, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12}} interval={0} angle={-45} textAnchor="end" />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(value) => `฿${value.toLocaleString()}`} />
                  <RechartsTooltip cursor={{fill: 'transparent'}} formatter={(value) => `฿${Math.round(value).toLocaleString()}`} />
                  <Bar dataKey="spent" name="Spent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-1 flex flex-col">
            <h3 className="text-lg font-bold mb-4">Learning Hours by Dept</h3>
            <div className="h-[360px] flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.pieData} cx="50%" cy="40%" innerRadius={50} outerRadius={80} paddingAngle={5} dataKey="hours" nameKey="name">
                    {metrics.pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(value) => `${value} Hrs`} />
                  <Legend 
                    content={(props) => {
                      const { payload } = props;
                      return (
                        <ul className="flex flex-wrap justify-center gap-x-3 gap-y-2 text-xs mt-2 max-h-[140px] overflow-y-auto px-2 custom-scrollbar">
                          {payload.map((entry, index) => (
                            <li key={`item-${index}`} className="flex items-center text-slate-600">
                              <span className="w-2.5 h-2.5 rounded-full mr-1.5 flex-shrink-0" style={{ backgroundColor: entry.color }}></span>
                              {entry.value}
                            </li>
                          ))}
                        </ul>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Leaderboard Widget */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-1 flex flex-col">
            <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800">
              <Trophy size={20} className="mr-2 text-amber-500"/> Top 5 Learners
            </h3>
            <div className="flex-1 overflow-y-auto h-[360px]">
              {leaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <BookOpen size={32} className="mb-2 opacity-50"/>
                  <p className="text-sm">ยังไม่มีข้อมูลการอบรม</p>
                </div>
              ) : (
                <ul className="space-y-4 pr-2">
                  {leaderboard.map((learner, index) => (
                    <li key={index} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100 hover:border-blue-200 hover:shadow-sm transition-all">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0
                          ${index === 0 ? 'bg-amber-400 shadow-sm shadow-amber-200' : 
                            index === 1 ? 'bg-slate-300 shadow-sm shadow-slate-200' : 
                            index === 2 ? 'bg-amber-600 shadow-sm shadow-amber-200' : 
                            'bg-blue-100 text-blue-600'}`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          {/* Clickable Name for Profile Modal */}
                          <button 
                            onClick={() => setSelectedEmployee(learner)}
                            className="text-sm font-bold text-slate-800 truncate hover:text-blue-600 text-left block w-full outline-none" 
                            title="คลิกดูประวัติการอบรม"
                          >
                            {learner.name || learner.empId || 'Unknown'}
                          </button>
                          <div className="flex items-center gap-1 mt-0.5">
                             <span className={`text-[8px] font-bold px-1 rounded ${learner.company === 'MSS' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                               {learner.company}
                             </span>
                             <p className="text-[10px] text-slate-500 truncate" title={learner.department}>
                               {learner.department}
                             </p>
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm font-bold text-indigo-600">{learner.totalHours} <span className="text-xs font-normal text-indigo-400">h</span></p>
                        <p className="text-[10px] text-slate-500">{learner.courses} courses</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* Charts Section - Row 2 (Monthly Trend) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-4 flex flex-col">
            <h3 className="text-lg font-bold mb-4 flex items-center text-slate-800">
              <TrendingUp size={20} className="mr-2 text-blue-500"/> Monthly Trend (Spending & Learning Hours)
            </h3>
            <div className="h-[320px] w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fontSize: 12}} />
                  <YAxis yAxisId="left" axisLine={false} tickLine={false} tickFormatter={(value) => `฿${value >= 1000 ? (value/1000)+'k' : value}`} width={60} />
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tickFormatter={(value) => `${value}h`} width={40} />
                  <RechartsTooltip formatter={(value, name) => [name.includes('Spent') ? `฿${Math.round(value).toLocaleString()}` : `${value} Hrs`, name]} />
                  <Legend verticalAlign="top" height={36} />
                  <Line yAxisId="left" type="monotone" dataKey="trainingSpent" name="Training Spent" stroke="#3b82f6" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                  <Line yAxisId="left" type="monotone" dataKey="engagementSpent" name="Engagement Spent" stroke="#ec4899" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                  <Line yAxisId="right" type="monotone" dataKey="hours" name="Total Learning Hours" stroke="#f59e0b" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Data Input & Table Section */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* Input Form */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit xl:col-span-1">
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <PlusCircle size={20} className="mr-2 text-blue-600"/> Add Record
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="flex gap-4 p-1 bg-slate-100 rounded-lg">
                <label className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${formData.type === 'Training' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <input type="radio" name="type" value="Training" checked={formData.type === 'Training'} onChange={handleInputChange} className="hidden" />
                  <BookOpen size={16} /> Training
                </label>
                <label className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md cursor-pointer transition-colors ${formData.type === 'Engagement' ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  <input type="radio" name="type" value="Engagement" checked={formData.type === 'Engagement'} onChange={handleInputChange} className="hidden" />
                  <PartyPopper size={16} /> Engagement
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Activity / Course Name</label>
                <input required type="text" name="course" value={formData.course} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={formData.type === 'Training' ? "e.g. AML Compliance" : "e.g. Songkran Festival"} />
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input required type="date" name="date" value={formData.date} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duration (Hrs)</label>
                  {formData.type === 'Engagement' ? (
                    <input disabled type="text" value="N/A" className="w-full px-3 py-2 border border-slate-200 bg-slate-100 text-slate-400 rounded-lg cursor-not-allowed font-medium text-center" title="Engagement activities do not add to learning hours" />
                  ) : (
                    <input required type="number" min="0.5" step="0.5" name="durationHours" value={formData.durationHours} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. 2.5" />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Cost (฿)</label>
                <input required type="number" min="0" name="totalCost" value={formData.totalCost} onChange={handleInputChange} className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" />
              </div>

              {/* Individual Attendees Section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">รายชื่อผู้เข้าร่วม (Attendees)</label>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleAddAllStaff} className="text-xs font-semibold text-pink-600 hover:text-pink-800 flex items-center bg-pink-50 px-2 py-1 rounded" title="ดึงรายชื่อพนักงานทั้งหมด (สำหรับ All Staff)">
                      <Users size={12} className="mr-1" /> All Staff
                    </button>
                    <button type="button" onClick={addAttendee} className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center bg-blue-50 px-2 py-1 rounded">
                      + Add
                    </button>
                  </div>
                </div>
                
                <datalist id="employee-names-list">
                  {Object.values(employeeMaster).map((emp, idx) => (
                    <option key={idx} value={emp.name} />
                  ))}
                </datalist>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {formData.attendees.map((attendee, index) => {
                    const empIdVal = attendee.empId.trim();
                    const isDuplicate = empIdVal !== '' && duplicateEmpIds.has(empIdVal);

                    return (
                      <div key={index} className={`flex flex-col gap-2 p-3 bg-slate-50 border rounded-lg relative group transition-colors ${isDuplicate ? 'border-red-400 bg-red-50/30' : 'border-slate-200'}`}>
                        {formData.attendees.length > 1 && (
                          <button type="button" onClick={() => removeAttendee(index)} className="absolute -top-2 -right-2 bg-white rounded-full p-1 text-slate-400 hover:text-red-500 shadow-sm border border-slate-200 opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={14} />
                          </button>
                        )}
                        
                        <div className="flex gap-2">
                          <input 
                            type="text" 
                            placeholder="Emp ID" 
                            value={attendee.empId} 
                            onChange={(e) => handleAttendeeChange(index, 'empId', e.target.value)} 
                            className={`w-1/3 px-2 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 bg-white ${isDuplicate ? 'border-red-400 focus:ring-red-500' : 'border-slate-300 focus:ring-blue-500 placeholder:text-blue-300'}`} 
                          />
                          <input 
                            type="text" 
                            placeholder="Name - Surname" 
                            list="employee-names-list"
                            value={attendee.name} 
                            onChange={(e) => handleAttendeeChange(index, 'name', e.target.value)} 
                            className="w-2/3 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                          />
                        </div>

                        {isDuplicate && (
                          <p className="text-[10px] text-red-500 flex items-center mt-[-4px]">
                            <AlertCircle size={10} className="mr-1" /> รหัสพนักงานซ้ำ
                          </p>
                        )}

                        <div className="flex gap-2">
                           <select 
                             value={attendee.company} 
                             onChange={(e) => handleAttendeeChange(index, 'company', e.target.value)} 
                             className="w-1/3 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white font-bold text-indigo-700"
                           >
                             {COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                           </select>

                           <select 
                             value={attendee.department} 
                             onChange={(e) => handleAttendeeChange(index, 'department', e.target.value)} 
                             className="w-2/3 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                             required
                           >
                             <option value="" disabled>Department</option>
                             {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                             <option value="Other" className="font-semibold text-blue-600">+ เพิ่มแผนกใหม่ (Other)</option>
                           </select>
                        </div>
                        
                        {attendee.department === 'Other' && (
                          <input 
                            type="text" 
                            placeholder="พิมพ์ชื่อแผนกใหม่ที่นี่..." 
                            required
                            value={attendee.customDepartment} 
                            onChange={(e) => handleAttendeeChange(index, 'customDepartment', e.target.value)} 
                            className="w-full px-2 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" 
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 flex gap-2">
                <button type="submit" className={`flex-1 ${editingId ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm`}>
                  {editingId ? 'Update Record' : 'Save to Cloud'}
                </button>
                {editingId && (
                  <button type="button" onClick={resetForm} className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm">
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Data Table with Expandable Rows, Search & Pagination */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm xl:col-span-3 overflow-hidden flex flex-col h-fit">
            
            {/* Table Header & Controls */}
            <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <h3 className="text-lg font-bold">Raw Data Log</h3>
              
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="ค้นหาคอร์ส, ประเภท..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input 
                    type="file" 
                    accept=".csv" 
                    id="csv-upload" 
                    ref={fileInputRef}
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                  <label 
                    htmlFor="csv-upload"
                    className="flex items-center justify-center space-x-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-emerald-200"
                    title="Upload Employee Master List (CSV)"
                  >
                    <UploadCloud size={16} />
                    <span className="hidden sm:inline">Import DB</span>
                  </label>

                  <button 
                    onClick={exportToCSV}
                    className="flex items-center justify-center space-x-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
                  >
                    <Download size={16} />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-x-auto p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                    <th className="p-4 font-medium">Date</th>
                    <th className="p-4 font-medium">Course / Activity</th>
                    <th className="p-4 font-medium">Seats Filled</th>
                    <th className="p-4 font-medium text-right">Hours</th>
                    <th className="p-4 font-medium text-right">Cost (฿)</th>
                    <th className="p-4 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {paginatedRecords.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-8 text-center text-slate-400">
                        {searchTerm ? "ไม่พบข้อมูลที่ค้นหา" : "No records found. Add your first training log above!"}
                      </td>
                    </tr>
                  ) : (
                    paginatedRecords.map((record) => {
                      let seats = 0;
                      if (record.attendees) seats = record.attendees.length;
                      else if (record.allocations) seats = record.allocations.reduce((sum, a) => sum + Number(a.participants), 0);
                      
                      const cost = record.totalCost || record.cost || 0;
                      const duration = record.durationHours || 0;
                      const isExpanded = expandedRows.has(record.id);
                      const isEngagement = record.type === 'Engagement';

                      return (
                        <React.Fragment key={record.id}>
                          <tr className={`hover:bg-slate-50 transition-colors ${editingId === record.id ? 'bg-amber-50' : ''} ${isExpanded ? 'bg-blue-50/40' : ''}`}>
                            <td className="p-4 whitespace-nowrap text-slate-500 flex items-center gap-2">
                              <button 
                                onClick={() => toggleRow(record.id)}
                                className="p-1 rounded hover:bg-slate-200 text-slate-500 transition-colors"
                              >
                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </button>
                              {record.date}
                            </td>
                            <td className="p-4 font-medium text-slate-800">
                              <div className="flex items-center gap-2">
                                {isEngagement ? (
                                  <span className="px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded text-[10px] font-bold uppercase tracking-wider flex items-center" title="Engagement Activity">
                                    <PartyPopper size={10} className="mr-1" /> ENGAGE
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-bold uppercase tracking-wider flex items-center" title="Training">
                                    <BookOpen size={10} className="mr-1" /> TRAIN
                                  </span>
                                )}
                                {record.course}
                              </div>
                            </td>
                            <td className="p-4">
                              <span 
                                className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors border border-slate-200"
                                onClick={() => toggleRow(record.id)}
                                title="Click to see attendees"
                              >
                                {seats} Persons
                              </span>
                            </td>
                            <td className="p-4 text-right whitespace-nowrap text-slate-600 font-medium">
                              {isEngagement ? (
                                <span className="text-slate-400">-</span>
                              ) : (
                                <>
                                  {duration}h <span className="opacity-50 text-xs font-normal">x {seats}</span>
                                </>
                              )}
                            </td>
                            <td className="p-4 text-right text-slate-600">฿{cost.toLocaleString()}</td>
                            <td className="p-4 flex justify-center space-x-1">
                              <button onClick={() => handleEditClick(record)} className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors" title="Edit">
                                <Edit2 size={16} />
                              </button>
                              
                              <button onClick={() => setRecordToDelete(record.id)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Delete">
                                <Trash2 size={16} />
                              </button>
                            </td>
                          </tr>
                          
                          {/* Expanded Row Details */}
                          {isExpanded && (
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <td colSpan="6" className="p-4 pl-12">
                                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Attendee List ({seats} Persons)</h4>
                                  
                                  {record.attendees && record.attendees.length > 0 ? (
                                    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                      {record.attendees.map((a, idx) => (
                                        <li key={idx} className="flex items-start p-2 bg-slate-50 border border-slate-100 rounded-md hover:bg-white transition-colors group">
                                          <UserCheck size={14} className={`mt-0.5 mr-2 flex-shrink-0 ${isEngagement ? 'text-pink-500' : 'text-emerald-500'}`} />
                                          <div className="min-w-0">
                                            {/* Clickable Name inside expanded row */}
                                            <button 
                                              onClick={() => setSelectedEmployee(a)}
                                              className="text-sm font-medium text-slate-800 truncate text-left outline-none group-hover:text-blue-600 transition-colors block w-full" 
                                              title="คลิกดูประวัติการอบรม"
                                            >
                                              {a.empId ? `[${a.empId}] ` : ''}{a.name || 'Unknown Name'}
                                            </button>
                                            <div className="flex items-center gap-1 mt-0.5">
                                              <span className={`text-[8px] font-bold px-1 rounded ${a.company === 'MSS' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                {a.company || 'PCHI'}
                                              </span>
                                              <p className="text-[10px] text-slate-500 truncate" title={a.department}>{a.department}</p>
                                            </div>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {record.allocations?.map((a, idx) => (
                                        <span key={idx} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md text-sm border border-slate-200">
                                          {a.department} <span className="font-semibold text-slate-800 ml-1">{a.participants} pax</span>
                                        </span>
                                      ))}
                                      {(!record.allocations && record.department) && (
                                        <span className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-md text-sm border border-slate-200">
                                          {record.department} <span className="font-semibold text-slate-800 ml-1">{record.participants} pax</span>
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {searchedRecords.length > 0 && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between text-sm bg-white">
                <span className="text-slate-500">
                  Showing <span className="font-medium text-slate-800">{((currentPage - 1) * rowsPerPage) + 1}</span> to <span className="font-medium text-slate-800">{Math.min(currentPage * rowsPerPage, searchedRecords.length)}</span> of <span className="font-medium text-slate-800">{searchedRecords.length}</span> entries
                </span>
                
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                    title="Previous Page"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="px-3 py-1.5 text-slate-600 font-medium">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-transparent transition-colors"
                    title="Next Page"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
            
          </div>
          
        </div>
      </div>
    </div>
  );
}
