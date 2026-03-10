import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  DollarSign,
  Users,
  BookOpen,
  TrendingUp,
  Trash2,
  PlusCircle,
  Loader2,
  Download,
  Edit2,
  AlertCircle,
  CheckCircle,
  Clock,
  X,
} from "lucide-react";
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithCustomToken,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
} from "firebase/firestore";

// Initialize Firebase OUTSIDE component to prevent re-initialization
const firebaseConfig = {
  apiKey: "AIzaSyDFwSy_fQx1j_8LQK2LWxu6qqjN-Qm2rRw",
  authDomain: "training-dashboard-d984f.firebaseapp.com",
  projectId: "training-dashboard-d984f",
  storageBucket: "training-dashboard-d984f.firebasestorage.app",
  messagingSenderId: "841547478662",
  appId: "1:841547478662:web:575aa37097b17fecda4307",
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Base departments (Added missing key roles for Insurance)
const BASE_DEPARTMENTS = [
  "Underwriting",
  "Claims",
  "Actuarial",
  "Agency Sales",
  "Direct Sales",
  "Customer Service",
  "Legal & Compliance",
  "IT & Technology",
  "HR & Training",
  "Finance & Accounting",
  "Operations",
  "Marketing",
  "Risk Management",
  "Internal Audit",
  "Investment",
  "Business Development",
];

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#64748b",
  "#0ea5e9",
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Data States
  const [records, setRecords] = useState([]);
  const [annualBudget, setAnnualBudget] = useState(1000000);

  // UI States
  const [editingId, setEditingId] = useState(null);
  const [filterYear, setFilterYear] = useState("All");
  const [toast, setToast] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    course: "",
    date: "",
    totalCost: "",
    durationHours: "",
    allocations: [
      { department: "Underwriting", customDepartment: "", participants: "" },
    ],
  });

  // 1. Authentication Effect
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (
          typeof __initial_auth_token !== "undefined" &&
          __initial_auth_token
        ) {
          try {
            await signInWithCustomToken(auth, __initial_auth_token);
          } catch (tokenError) {
            console.warn(
              "Sandbox token invalid for custom config. Falling back to Anonymous Auth..."
            );
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

  // 2. Data Fetching Effect
  useEffect(() => {
    if (!user) return;

    const recordsRef = collection(db, "training_records");
    const unsubRecords = onSnapshot(
      recordsRef,
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        data.sort((a, b) => new Date(b.date) - new Date(a.date));
        setRecords(data);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching records:", error);
        setIsLoading(false);
      }
    );

    const settingsRef = doc(db, "settings", "budget");
    const unsubSettings = onSnapshot(
      settingsRef,
      (docSnap) => {
        if (docSnap.exists() && docSnap.data().annualBudget !== undefined) {
          setAnnualBudget(docSnap.data().annualBudget);
        }
      },
      (error) => {
        console.error("Error fetching budget:", error);
      }
    );

    return () => {
      unsubRecords();
      unsubSettings();
    };
  }, [user]);

  // --- Dynamic Department Generation ---
  // Combine base departments with any custom departments saved in the database
  const availableDepartments = useMemo(() => {
    const usedDepts = records
      .flatMap((r) =>
        r.allocations ? r.allocations.map((a) => a.department) : [r.department]
      )
      .filter(Boolean);

    // Use Set to remove duplicates, then sort alphabetically
    const uniqueDepts = Array.from(
      new Set([...BASE_DEPARTMENTS, ...usedDepts])
    );
    return uniqueDepts.sort();
  }, [records]);

  // Derived Data & Calculations
  const availableYears = useMemo(() => {
    const years = records.map((r) => r.date?.substring(0, 4)).filter(Boolean);
    return ["All", ...Array.from(new Set(years)).sort().reverse()];
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (filterYear === "All") return records;
    return records.filter((r) => r.date?.startsWith(filterYear));
  }, [records, filterYear]);

  const metrics = useMemo(() => {
    let totalSpent = 0;
    let totalParticipants = 0;
    let totalLearningHours = 0;
    const deptStats = {};

    // Initialize stats object with all dynamically available departments
    availableDepartments.forEach((d) => {
      deptStats[d] = { name: d, spent: 0, participants: 0, hours: 0 };
    });

    filteredRecords.forEach((record) => {
      const allocations = record.allocations || [
        {
          department: record.department,
          participants: record.participants || 0,
        },
      ];
      const recordCost = Number(record.totalCost || record.cost || 0);
      const duration = Number(record.durationHours || 0);

      const recordTotalParticipants = allocations.reduce(
        (sum, a) => sum + Number(a.participants || 0),
        0
      );

      totalSpent += recordCost;
      totalParticipants += recordTotalParticipants;
      totalLearningHours += duration * recordTotalParticipants;

      allocations.forEach((alloc) => {
        const p = Number(alloc.participants || 0);
        // Fallback for edge cases where a department might be deleted or missing
        if (p === 0 || !alloc.department) return;
        if (!deptStats[alloc.department]) {
          deptStats[alloc.department] = {
            name: alloc.department,
            spent: 0,
            participants: 0,
            hours: 0,
          };
        }

        const proportion =
          recordTotalParticipants > 0 ? p / recordTotalParticipants : 0;
        const deptCost = recordCost * proportion;
        const deptHours = duration * p;

        deptStats[alloc.department].spent += deptCost;
        deptStats[alloc.department].participants += p;
        deptStats[alloc.department].hours += deptHours;
      });
    });

    // Only chart departments that have actual participants or spending to keep charts clean
    const chartData = Object.values(deptStats).filter(
      (d) => d.participants > 0 || d.spent > 0
    );
    const pieData = chartData.filter((d) => d.participants > 0);

    return {
      totalSpent,
      totalParticipants,
      totalLearningHours,
      chartData,
      pieData,
    };
  }, [filteredRecords, availableDepartments]);

  // Handlers
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAllocationChange = (index, field, value) => {
    const newAllocations = [...formData.allocations];
    newAllocations[index][field] = value;
    setFormData((prev) => ({ ...prev, allocations: newAllocations }));
  };

  const addAllocation = () => {
    setFormData((prev) => ({
      ...prev,
      allocations: [
        ...prev.allocations,
        {
          department: availableDepartments[0] || "Underwriting",
          customDepartment: "",
          participants: "",
        },
      ],
    }));
  };

  const removeAllocation = (index) => {
    const newAllocations = formData.allocations.filter((_, i) => i !== index);
    setFormData((prev) => ({ ...prev, allocations: newAllocations }));
  };

  const handleBudgetChange = (e) => setAnnualBudget(Number(e.target.value));

  const saveBudgetToCloud = async (newBudget) => {
    if (!user) return;
    try {
      const settingsRef = doc(db, "settings", "budget");
      await setDoc(settingsRef, { annualBudget: newBudget }, { merge: true });
      showToast("Budget updated successfully!");
    } catch (error) {
      console.error("Error saving budget", error);
    }
  };

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const exportToCSV = () => {
    const headers = [
      "Date",
      "Course",
      "Duration (Hrs)",
      "Departments Breakdown",
      "Total Participants",
      "Total Cost (THB)",
    ];
    const rows = filteredRecords.map((r) => {
      const allocs = r.allocations || [
        { department: r.department, participants: r.participants },
      ];
      const breakdown = allocs
        .map((a) => `${a.department} (${a.participants})`)
        .join(" | ");
      const totalP = allocs.reduce((sum, a) => sum + Number(a.participants), 0);
      const cost = r.totalCost || r.cost || 0;
      const duration = r.durationHours || 0;
      return [
        r.date,
        `"${r.course}"`,
        duration,
        `"${breakdown}"`,
        totalP,
        cost,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `training_report_${filterYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Exported to CSV!");
  };

  const handleEditClick = (record) => {
    setFormData({
      course: record.course || "",
      date: record.date || "",
      totalCost: record.totalCost || record.cost || "",
      durationHours: record.durationHours || "",
      // Ensure customDepartment field exists for editing form
      allocations: (
        record.allocations || [
          { department: record.department, participants: record.participants },
        ]
      ).map((a) => ({
        department: a.department,
        customDepartment: "",
        participants: a.participants,
      })),
    });
    setEditingId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetForm = () => {
    setFormData({
      course: "",
      date: "",
      totalCost: "",
      durationHours: "",
      allocations: [
        {
          department: availableDepartments[0] || "Underwriting",
          customDepartment: "",
          participants: "",
        },
      ],
    });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !formData.course || !formData.totalCost || !formData.date)
      return;

    // Validate allocations and handle custom departments
    const validAllocations = [];
    for (let a of formData.allocations) {
      if (Number(a.participants) > 0) {
        // If "Other" is selected, use the custom text input instead
        const finalDepartment =
          a.department === "Other"
            ? a.customDepartment.trim() || "Unknown Department"
            : a.department;

        validAllocations.push({
          department: finalDepartment,
          participants: Number(a.participants),
        });
      }
    }

    if (validAllocations.length === 0) {
      showToast("Please add at least one participant.", "error");
      return;
    }

    const recordId = editingId || Date.now().toString();
    const newRecord = {
      course: formData.course,
      date: formData.date,
      totalCost: Number(formData.totalCost),
      durationHours: Number(formData.durationHours || 0),
      allocations: validAllocations,
    };

    const currentCost = editingId
      ? records.find((r) => r.id === editingId)?.totalCost ||
        records.find((r) => r.id === editingId)?.cost ||
        0
      : 0;
    const willExceedBudget =
      metrics.totalSpent - currentCost + newRecord.totalCost > annualBudget;

    try {
      const docRef = doc(db, "training_records", recordId);
      await setDoc(docRef, newRecord);
      resetForm();

      if (willExceedBudget) {
        showToast("Record saved, but warning: Budget exceeded!", "warning");
      } else {
        showToast(
          editingId
            ? "Record updated successfully!"
            : "Record added successfully!"
        );
      }
    } catch (error) {
      console.error("Error saving record:", error);
      showToast("Error saving record", "error");
    }
  };

  const deleteRecord = async (id) => {
    if (!user) return;
    try {
      const docRef = doc(db, "training_records", id);
      await deleteDoc(docRef);
      showToast("Record deleted.");
    } catch (error) {
      console.error("Error deleting record:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
        <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
        <h2 className="text-xl font-medium text-slate-700">
          Connecting to secure cloud storage...
        </h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans text-slate-800">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center px-4 py-3 rounded-lg shadow-lg text-white ${
            toast.type === "warning"
              ? "bg-amber-500"
              : toast.type === "error"
              ? "bg-red-500"
              : "bg-emerald-500"
          } transition-opacity duration-300`}
        >
          {toast.type === "warning" ? (
            <AlertCircle size={20} className="mr-2" />
          ) : (
            <CheckCircle size={20} className="mr-2" />
          )}
          <span className="font-medium">{toast.message}</span>
        </div>
      )}

      <div className="max-w-[1400px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Training Hours & Budget
            </h1>
            <p className="text-slate-500 mt-1">
              Track multi-department spending, participation, and learning hours{" "}
              <span className="text-blue-500 font-medium ml-2 text-sm">
                (Live Auto-Save ON)
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm">
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="bg-transparent text-sm font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year === "All" ? "All Time" : `${year} Year`}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center space-x-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm">
              <label className="text-sm font-medium text-slate-500">
                Total Budget (THB):
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  ฿
                </span>
                <input
                  type="number"
                  value={annualBudget}
                  onChange={handleBudgetChange}
                  onBlur={(e) => saveBudgetToCloud(Number(e.target.value))}
                  className="w-32 pl-7 pr-2 py-1.5 text-right font-bold text-slate-800 border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
              <DollarSign size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Spent
              </p>
              <h3 className="text-2xl font-bold text-slate-800">
                ฿{metrics.totalSpent.toLocaleString("th-TH")}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-emerald-100 text-emerald-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Remaining
              </p>
              <h3
                className={`text-2xl font-bold ${
                  annualBudget - metrics.totalSpent < 0
                    ? "text-red-500"
                    : "text-slate-800"
                }`}
              >
                ฿{(annualBudget - metrics.totalSpent).toLocaleString("th-TH")}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-amber-100 text-amber-600 rounded-lg">
              <Users size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Participants
              </p>
              <h3 className="text-2xl font-bold text-slate-800">
                {metrics.totalParticipants}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <Clock size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Learning Hours
              </p>
              <h3 className="text-2xl font-bold text-slate-800">
                {metrics.totalLearningHours.toLocaleString()}
              </h3>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center space-x-4">
            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Avg Cost/Pax
              </p>
              <h3 className="text-2xl font-bold text-slate-800">
                ฿
                {metrics.totalParticipants
                  ? Math.round(
                      metrics.totalSpent / metrics.totalParticipants
                    ).toLocaleString("th-TH")
                  : 0}
              </h3>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm lg:col-span-2">
            <h3 className="text-lg font-bold mb-4">
              Proportional Spent by Department (THB)
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={metrics.chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 25 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12 }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value) =>
                      `฿${value.toLocaleString("th-TH")}`
                    }
                  />
                  <RechartsTooltip
                    cursor={{ fill: "transparent" }}
                    formatter={(value) =>
                      `฿${Math.round(value).toLocaleString("th-TH")}`
                    }
                  />
                  <Bar
                    dataKey="spent"
                    name="Spent"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold mb-4">Learning Hours by Dept</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={metrics.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="hours"
                    nameKey="name"
                  >
                    {metrics.pieData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <RechartsTooltip formatter={(value) => `${value} Hrs`} />
                  <Legend iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Data Input & Table Section */}
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          {/* Input Form */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm h-fit xl:col-span-1">
            <h3 className="text-lg font-bold mb-4 flex items-center">
              <PlusCircle size={20} className="mr-2 text-blue-600" /> Add Mixed
              Training
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Course Name
                </label>
                <input
                  required
                  type="text"
                  name="course"
                  value={formData.course}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. AML Compliance"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Date
                  </label>
                  <input
                    required
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Duration (Hrs)
                  </label>
                  <input
                    required
                    type="number"
                    min="0.5"
                    step="0.5"
                    name="durationHours"
                    value={formData.durationHours}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. 2.5"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Total Course Cost (฿)
                </label>
                <input
                  required
                  type="number"
                  min="0"
                  name="totalCost"
                  value={formData.totalCost}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              {/* Dynamic Allocations */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Departments Attending
                  </label>
                  <button
                    type="button"
                    onClick={addAllocation}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center bg-blue-50 px-2 py-1 rounded"
                  >
                    + Add Dept
                  </button>
                </div>

                <div className="space-y-2">
                  {formData.allocations.map((alloc, index) => (
                    <div
                      key={index}
                      className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <select
                          value={alloc.department}
                          onChange={(e) =>
                            handleAllocationChange(
                              index,
                              "department",
                              e.target.value
                            )
                          }
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          {availableDepartments.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          <option
                            value="Other"
                            className="font-semibold text-blue-600"
                          >
                            + เพิ่มแผนกใหม่ (Other)
                          </option>
                        </select>
                        <input
                          type="number"
                          min="1"
                          placeholder="Pax"
                          value={alloc.participants}
                          onChange={(e) =>
                            handleAllocationChange(
                              index,
                              "participants",
                              e.target.value
                            )
                          }
                          className="w-16 px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {formData.allocations.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAllocation(index)}
                            className="p-1 text-slate-400 hover:text-red-500"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {/* Show text input ONLY if "Other" is selected */}
                      {alloc.department === "Other" && (
                        <div className="mt-1">
                          <input
                            type="text"
                            placeholder="พิมพ์ชื่อแผนกใหม่ที่นี่..."
                            required
                            value={alloc.customDepartment}
                            onChange={(e) =>
                              handleAllocationChange(
                                index,
                                "customDepartment",
                                e.target.value
                              )
                            }
                            className="w-full px-3 py-1.5 text-sm border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 flex gap-2">
                <button
                  type="submit"
                  className={`flex-1 ${
                    editingId
                      ? "bg-amber-500 hover:bg-amber-600"
                      : "bg-blue-600 hover:bg-blue-700"
                  } text-white font-medium py-2 px-4 rounded-lg transition-colors shadow-sm`}
                >
                  {editingId ? "Update Record" : "Save to Cloud"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium py-2 px-4 rounded-lg transition-colors shadow-sm"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm xl:col-span-3 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 justify-between items-center">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold">Raw Data Log</h3>
                <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100 hidden sm:inline-block">
                  Live Sync Active
                </span>
              </div>
              <button
                onClick={exportToCSV}
                className="flex items-center space-x-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download size={16} />
                <span>Export CSV</span>
              </button>
            </div>
            <div className="overflow-x-auto flex-1 p-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider">
                    <th className="p-4 font-medium">Date</th>
                    <th className="p-4 font-medium">Course</th>
                    <th className="p-4 font-medium">Departments (Pax)</th>
                    <th className="p-4 font-medium text-right">Hours</th>
                    <th className="p-4 font-medium text-right">Cost (฿)</th>
                    <th className="p-4 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td
                        colSpan="6"
                        className="p-8 text-center text-slate-400"
                      >
                        No records found. Add your first training log above!
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((record) => {
                      // Normalize allocations for display
                      const allocs = record.allocations || [
                        {
                          department: record.department,
                          participants: record.participants,
                        },
                      ];
                      const totalP = allocs.reduce(
                        (sum, a) => sum + Number(a.participants || 0),
                        0
                      );
                      const cost = record.totalCost || record.cost || 0;
                      const duration = record.durationHours || 0;

                      return (
                        <tr
                          key={record.id}
                          className={`hover:bg-slate-50 transition-colors ${
                            editingId === record.id ? "bg-amber-50" : ""
                          }`}
                        >
                          <td className="p-4 whitespace-nowrap text-slate-500">
                            {record.date}
                          </td>
                          <td className="p-4 font-medium text-slate-800">
                            {record.course}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {allocs.map((a, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs font-medium whitespace-nowrap"
                                >
                                  {a.department}{" "}
                                  <span className="opacity-60 ml-1">
                                    ({a.participants})
                                  </span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-right whitespace-nowrap text-slate-600">
                            {duration}h{" "}
                            <span className="opacity-50 text-xs">
                              x {totalP}
                            </span>
                          </td>
                          <td className="p-4 text-right text-slate-600">
                            ฿{cost.toLocaleString("th-TH")}
                          </td>
                          <td className="p-4 flex justify-center space-x-1">
                            <button
                              onClick={() => handleEditClick(record)}
                              className="p-2 text-slate-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => deleteRecord(record.id)}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
