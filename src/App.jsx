import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import "./App.css";

import { db, auth } from "./firebase";
import { supabase } from "./supabase";

import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  onSnapshot,
  query,
} from "firebase/firestore";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

export default function App() {
  const estimateCollection = collection(db, "estimates");

  const adminEmails = ["admin@woorim.com", "ds@woorim-tech.com", "nr@woorim-tech.com"];

  const [estimates, setEstimates] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [selectedEstimate, setSelectedEstimate] = useState(null);
  const [companyHistory, setCompanyHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const firstLoadRef = useRef(true);

  const isAdmin = user && adminEmails.includes(user.email);

  const emptyForm = {
    requestDate: "",
    requestPath: "",
    company: "",
    manager: "",
    phone: "",
    estimateAmount: "",
    contractAmount: "",
    firstRequest: "",
    firstResult: "",
    progress: "견적접수",
    extraRequests: [],
    drawings: [],
    quotes: [],
    etcFiles: [],
  };

  const [form, setForm] = useState(emptyForm);

  const progressList = [
    "견적접수",
    "견적회신",
    "계약체결",
    "견적취소",
    "제작중",
    "납품완료",
    "결제완료",
    "AS중",
    "AS완료",
    "종결",
  ];

  const toNumber = (value) =>
    Number(String(value || "").replace(/[^0-9]/g, "")) || 0;

  const formatMoney = (value) => {
    const number = toNumber(value);
    if (!number) return "";
    return number.toLocaleString();
  };

  const filteredEstimates = estimates.filter((item) => {
    const keyword = searchText.toLowerCase();

    const textMatch =
      item.manageNo?.toLowerCase().includes(keyword) ||
      item.company?.toLowerCase().includes(keyword) ||
      item.manager?.toLowerCase().includes(keyword) ||
      item.phone?.toLowerCase().includes(keyword) ||
      item.progress?.toLowerCase().includes(keyword) ||
      item.requestPath?.toLowerCase().includes(keyword);

    const statusMatch =
      statusFilter === "전체" || item.progress === statusFilter;

    const date = item.requestDate || "";
    const startMatch = !startDate || date >= startDate;
    const endMatch = !endDate || date <= endDate;

    return textMatch && statusMatch && startMatch && endMatch;
  });

  const totalEstimateAmount = filteredEstimates.reduce(
    (sum, item) => sum + toNumber(item.estimateAmount),
    0
  );

  const totalContractAmount = filteredEstimates.reduce(
    (sum, item) => sum + toNumber(item.contractAmount),
    0
  );

  const monthlyStats = Object.values(
    filteredEstimates.reduce((acc, item) => {
      const month = item.requestDate ? item.requestDate.slice(0, 7) : "날짜없음";

      if (!acc[month]) {
        acc[month] = {
          month,
          count: 0,
          estimateAmount: 0,
          contractAmount: 0,
        };
      }

      acc[month].count += 1;
      acc[month].estimateAmount += toNumber(item.estimateAmount);
      acc[month].contractAmount += toNumber(item.contractAmount);

      return acc;
    }, {})
  ).sort((a, b) => b.month.localeCompare(a.month));

  const maxMonthlyAmount = Math.max(
    ...monthlyStats.map((item) =>
      Math.max(item.estimateAmount, item.contractAmount)
    ),
    1
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(estimateCollection);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const result = snapshot.docs.map((item) => ({
        ...item.data(),
        firebaseId: item.id,
      }));

      const sortedResult = result.reverse();
      setEstimates(sortedResult);

      if (firstLoadRef.current) {
        firstLoadRef.current = false;
        return;
      }

      const latest = sortedResult[0];
      if (!latest) return;

      playNotificationSound();

      setNotifications((prev) => [
        {
          text: `관리번호: ${latest.manageNo || ""}
접수일자: ${latest.requestDate || ""}
업체명: ${latest.company || ""}
담당자: ${latest.manager || ""}
견적금액: ${formatMoney(latest.estimateAmount)}
계약금액: ${formatMoney(latest.contractAmount)}
진행상황: ${latest.progress || ""}

1차 의뢰내용:
${latest.firstRequest || "내용 없음"}

1차 처리결과:
${latest.firstResult || "내용 없음"}

작성자: ${latest.writer || ""}
작성시간: ${latest.writeTime || ""}`,
          time: new Date().toLocaleString(),
        },
        ...prev,
      ]);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      alert("로그인 실패");
    }
  };

  const handleSignup = async () => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      alert("회원가입 완료");
    } catch (error) {
      alert(error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const playNotificationSound = () => {
    const audio = new Audio("/notification.mp3");
    audio.play().catch(() => {});
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditIndex(null);
  };

  const resetSearch = () => {
    setSearchText("");
    setStatusFilter("전체");
    setStartDate("");
    setEndDate("");
  };

  const setTodayFilter = () => {
    const today = new Date().toISOString().slice(0, 10);
    setStartDate(today);
    setEndDate(today);
  };

  const uploadFiles = async (files, folderName, manageNo) => {
    if (!files || files.length === 0) return [];

    const uploadedFiles = [];

    for (const file of files) {
      if (!(file instanceof File)) continue;

      const safeFileName =
        Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${manageNo}/${folderName}/${safeFileName}`;

      const { error } = await supabase.storage
        .from("estimate-files")
        .upload(filePath, file);

      if (error) {
        alert(`${file.name} 업로드 실패`);
        continue;
      }

      const { data } = supabase.storage
        .from("estimate-files")
        .getPublicUrl(filePath);

      uploadedFiles.push({
        name: file.name,
        url: data.publicUrl,
        path: filePath,
      });
    }

    return uploadedFiles;
  };

  const getCompanyCode = (company) => {
    const companyList = [...new Set(estimates.map((v) => v.company))];
    let companyIndex = companyList.indexOf(company);

    if (companyIndex === -1) {
      companyIndex = companyList.length;
    }

    return String(companyIndex + 1).padStart(4, "0");
  };

  const getEstimateNumber = (company) => {
    const count = estimates.filter((v) => v.company === company).length + 1;
    return String(count).padStart(4, "0");
  };

  const addExtraRequest = () => {
    const nextNumber = form.extraRequests.length + 2;

    setForm({
      ...form,
      extraRequests: [
        ...form.extraRequests,
        {
          title: `${nextNumber}차`,
          request: "",
          result: "",
          writer: user?.email || "관리자",
          writeTime: new Date().toLocaleString(),
        },
      ],
    });
  };

  const updateExtraRequest = (index, field, value) => {
    const updated = [...form.extraRequests];
    updated[index][field] = value;
    updated[index].writeTime = new Date().toLocaleString();

    setForm({
      ...form,
      extraRequests: updated,
    });
  };

  const handleSave = async () => {
    if (!form.company) {
      alert("업체명을 입력하세요");
      return;
    }

    if (editIndex !== null) {
      const target = estimates[editIndex];
      const manageNo = target.manageNo;

      if (!isAdmin && target.writer !== user.email) {
        alert("본인이 작성한 견적만 수정할 수 있습니다.");
        return;
      }

      const newDrawings = await uploadFiles(form.drawings, "drawings", manageNo);
      const newQuotes = await uploadFiles(form.quotes, "quotes", manageNo);
      const newEtcFiles = await uploadFiles(form.etcFiles, "etcFiles", manageNo);

      const saveData = {
        requestDate: form.requestDate,
        requestPath: form.requestPath,
        company: form.company,
        manager: form.manager,
        phone: form.phone,
        estimateAmount: form.estimateAmount,
        contractAmount: form.contractAmount,
        firstRequest: form.firstRequest,
        firstResult: form.firstResult,
        progress: form.progress,
        extraRequests: form.extraRequests,
        drawings: [...(target.drawings || []), ...newDrawings],
        quotes: [...(target.quotes || []), ...newQuotes],
        etcFiles: [...(target.etcFiles || []), ...newEtcFiles],
        modifier: user.email,
        modifyTime: new Date().toLocaleString(),
      };

      await updateDoc(doc(db, "estimates", target.firebaseId), saveData);
      alert("수정 저장이 완료되었습니다.");

      resetForm();

      window.scrollTo({
        top: 0,
        behavior: "smooth",
});

return;
    }

    const companyCode = getCompanyCode(form.company);
    const estimateCode = getEstimateNumber(form.company);
    const manageNo = `WR-${companyCode}-${estimateCode}`;

    const uploadedDrawings = await uploadFiles(form.drawings, "drawings", manageNo);
    const uploadedQuotes = await uploadFiles(form.quotes, "quotes", manageNo);
    const uploadedEtcFiles = await uploadFiles(form.etcFiles, "etcFiles", manageNo);

    const newItem = {
      requestDate: form.requestDate,
      requestPath: form.requestPath,
      company: form.company,
      manager: form.manager,
      phone: form.phone,
      estimateAmount: form.estimateAmount,
      contractAmount: form.contractAmount,
      firstRequest: form.firstRequest,
      firstResult: form.firstResult,
      progress: form.progress,
      extraRequests: form.extraRequests,
      drawings: uploadedDrawings,
      quotes: uploadedQuotes,
      etcFiles: uploadedEtcFiles,
      manageNo,
      writer: user.email,
      writeTime: new Date().toLocaleString(),
      modifier: "",
      modifyTime: "",
    };

    await addDoc(estimateCollection, newItem);
    alert("저장이 완료되었습니다.");

    resetForm();

    window.scrollTo({
      top: 0,
      behavior: "smooth",
   });
  };

  const handleEdit = (index) => {
    const item = filteredEstimates[index];

    if (!isAdmin && item.writer !== user.email) {
      alert("본인이 작성한 견적만 수정할 수 있습니다.");
      return;
    }

    const originalIndex = estimates.findIndex(
      (estimate) => estimate.firebaseId === item.firebaseId
    );

    setForm({
      requestDate: item.requestDate || "",
      requestPath: item.requestPath || "",
      company: item.company || "",
      manager: item.manager || "",
      phone: item.phone || "",
      estimateAmount: item.estimateAmount || "",
      contractAmount: item.contractAmount || "",
      firstRequest: item.firstRequest || "",
      firstResult: item.firstResult || "",
      progress: item.progress || "견적접수",
      extraRequests: item.extraRequests || [],
      drawings: [],
      quotes: [],
      etcFiles: [],
    });

    setEditIndex(originalIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (index) => {
  if (!isAdmin) {
    alert("삭제는 관리자만 가능합니다.");
    return;
  }

  if (!confirm("정말 삭제하시겠습니까?")) return;

  const target = filteredEstimates[index];

  await deleteDoc(doc(db, "estimates", target.firebaseId));

  alert("삭제가 완료되었습니다.");

  setSelectedEstimate(null);
  setShowHistory(false);
  resetForm();

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};


  const openCompanyHistory = (company) => {
    const history = estimates.filter((item) => item.company === company);
    setCompanyHistory(history);
    setShowHistory(true);
  };

  const downloadExcel = () => {
    const excelData = filteredEstimates.map((item) => ({
      관리번호: item.manageNo,
      접수일자: item.requestDate,
      의뢰경로: item.requestPath,
      업체명: item.company,
      담당자: item.manager,
      연락처: item.phone,
      견적금액: item.estimateAmount,
      계약금액: item.contractAmount,
      진행상황: item.progress,
      작성자: item.writer,
      작성시간: item.writeTime,
      수정자: item.modifier,
      수정시간: item.modifyTime,
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(workbook, worksheet, "견적현황");
    XLSX.writeFile(workbook, "견적현황관리.xlsx");
  };

  const printEstimatePdf = (item) => {
    const extraHtml =
      item.extraRequests?.map(
        (extra) => `
          <div class="section">
            <h3>${extra.title}</h3>
            <p><strong>의뢰내용:</strong><br/>${extra.request || "내용 없음"}</p>
            <p><strong>처리결과:</strong><br/>${extra.result || "내용 없음"}</p>
            <p><strong>작성자:</strong> ${extra.writer || ""}</p>
            <p><strong>작성시간:</strong> ${extra.writeTime || ""}</p>
          </div>
        `
      ).join("") || "<p>추가 의뢰내용 없음</p>";

    const fileHtml = (title, files) => `
      <div class="section">
        <h3>${title}</h3>
        ${
          files && files.length > 0
            ? files
                .map(
                  (file) =>
                    `<p><a href="${file.url}" target="_blank">${file.name}</a></p>`
                )
                .join("")
            : "<p>첨부파일 없음</p>"
        }
      </div>
    `;

    const html = `
      <html>
        <head>
          <title>${item.manageNo} 견적현황관리</title>
          <style>
            body {
              font-family: Arial, "Malgun Gothic", sans-serif;
              padding: 35px;
              color: #111827;
            }
            h1 {
              text-align: center;
              border-bottom: 3px solid #2563eb;
              padding-bottom: 15px;
              margin-bottom: 30px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 25px;
            }
            th {
              width: 150px;
              background: #f3f4f6;
              text-align: left;
            }
            th, td {
              border: 1px solid #d1d5db;
              padding: 12px;
              vertical-align: top;
            }
            .section {
              margin-top: 25px;
              padding: 15px;
              border: 1px solid #d1d5db;
              border-radius: 8px;
            }
            .section h3 {
              margin-top: 0;
              color: #2563eb;
            }
            .footer {
              margin-top: 40px;
              text-align: right;
              font-size: 14px;
            }
            @media print {
              button {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          <h1>우림기술 견적현황관리</h1>

          <table>
            <tr><th>관리번호</th><td>${item.manageNo || ""}</td></tr>
            <tr><th>접수일자</th><td>${item.requestDate || ""}</td></tr>
            <tr><th>의뢰경로</th><td>${item.requestPath || ""}</td></tr>
            <tr><th>업체명</th><td>${item.company || ""}</td></tr>
            <tr><th>담당자</th><td>${item.manager || ""}</td></tr>
            <tr><th>연락처</th><td>${item.phone || ""}</td></tr>
            <tr><th>견적금액</th><td>${formatMoney(item.estimateAmount)}원</td></tr>
            <tr><th>계약금액</th><td>${formatMoney(item.contractAmount)}원</td></tr>
            <tr><th>진행상황</th><td>${item.progress || ""}</td></tr>
            <tr><th>작성자</th><td>${item.writer || ""}</td></tr>
            <tr><th>작성시간</th><td>${item.writeTime || ""}</td></tr>
          </table>

          <div class="section">
            <h3>1차 의뢰내용</h3>
            <p>${item.firstRequest || "내용 없음"}</p>
          </div>

          <div class="section">
            <h3>1차 처리결과</h3>
            <p>${item.firstResult || "내용 없음"}</p>
          </div>

          ${extraHtml}

          ${fileHtml("도면첨부", item.drawings)}
          ${fileHtml("견적서첨부", item.quotes)}
          ${fileHtml("기타첨부", item.etcFiles)}

          <div class="footer">
            <p>출력일자: ${new Date().toLocaleString()}</p>
            <p>우림기술</p>
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const removeNotification = (index) => {
    const updated = [...notifications];
    updated.splice(index, 1);
    setNotifications(updated);
  };

 const downloadFile = async (file) => {
  if (!file.url) return;

  const response = await fetch(file.url);
  const blob = await response.blob();

  const blobUrl = window.URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = file.name || "download";

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);

  window.URL.revokeObjectURL(blobUrl);
};

const renderFiles = (files) => {
  if (!files || files.length === 0) {
    return <p className="emptyText">첨부파일 없음</p>;
  }

  return files.map((file, index) => (
    <div key={index} className="fileItem">
      <span>
        <strong>첨부파일명:</strong> {file.name}
      </span>

      {file.url ? (
        <button
          type="button"
          className="detailButton"
          onClick={() => downloadFile(file)}
        >
          다운로드
        </button>
      ) : (
        <span>저장 전 파일</span>
      )}
    </div>
  ));
};

  if (!user) {
    return (
      <div className="loginContainer">
        <h1>우림기술 견적현황관리 로그인</h1>

        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button onClick={handleLogin}>로그인</button>
        <button onClick={handleSignup}>회원가입</button>
      </div>
    );
  }

  return (
    <div className={darkMode ? "container darkMode" : "container"}>
      <div className="userInfo">
        로그인 사용자: {user.email}

        <span className={isAdmin ? "adminBadge" : "staffBadge"}>
          {isAdmin ? "관리자" : "직원"}
        </span>

        <button onClick={() => setDarkMode(!darkMode)}>
          {darkMode ? "라이트모드" : "다크모드"}
        </button>

        <button onClick={handleLogout}>로그아웃</button>
      </div>

      {isAdmin && (
        <div className="adminPanel">
          <h2>관리자 모드</h2>
          <p>관리자는 전체 견적 수정 및 삭제가 가능합니다.</p>
        </div>
      )}

      <div className="topHeader">
        <div className="titleArea">
          <img src="/woorim-logo.png" alt="우림기술 로고" className="logo" />
          <h1>견적접수처리현황</h1>
        </div>

        <button
          className="alarmButton"
          onClick={() => setShowNotifications(!showNotifications)}
        >
          알림 {notifications.length}
        </button>
      </div>

      {showNotifications && (
        <div className="notificationArea">
          <h2>알림</h2>

          {notifications.length === 0 && <p>새 알림이 없습니다.</p>}

          {notifications.map((item, index) => (
            <div className="notification" key={index}>
              <div className="notificationText">
                {item.text}
                <br />
                <br />
                알림시간: {item.time}
              </div>

              <button onClick={() => removeNotification(index)}>확인</button>
            </div>
          ))}
        </div>
      )}

      <div className="dashboard">
        {progressList.map((item) => (
          <div className="card" key={item}>
            <h3>{item}</h3>
            <p>{estimates.filter((v) => v.progress === item).length}건</p>
          </div>
        ))}
      </div>

      <div className="statsArea">
        <div className="statCard">
          <h3>조회 건수</h3>
          <p>{filteredEstimates.length}건</p>
        </div>

        <div className="statCard">
          <h3>견적금액 합계</h3>
          <p>{formatMoney(totalEstimateAmount)}원</p>
        </div>

        <div className="statCard">
          <h3>계약금액 합계</h3>
          <p>{formatMoney(totalContractAmount)}원</p>
        </div>
      </div>

      <div className="monthlyStats">
        <h2>월별 통계</h2>

        {monthlyStats.length === 0 && <p>통계 데이터가 없습니다.</p>}

        {monthlyStats.map((item) => (
          <div className="monthRow" key={item.month}>
            <div className="monthTitle">
              <strong>{item.month}</strong>
              <span>{item.count}건</span>
            </div>

            <div className="barGroup">
              <div className="barLabel">
                견적 {formatMoney(item.estimateAmount)}원
              </div>

              <div className="barTrack">
                <div
                  className="bar estimateBar"
                  style={{
                    width: `${(item.estimateAmount / maxMonthlyAmount) * 100}%`,
                  }}
                />
              </div>

              <div className="barLabel">
                계약 {formatMoney(item.contractAmount)}원
              </div>

              <div className="barTrack">
                <div
                  className="bar contractBar"
                  style={{
                    width: `${(item.contractAmount / maxMonthlyAmount) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="form">
        <h2>{editIndex !== null ? "견적 수정" : "견적현황작성"}</h2>

        <input
          type="date"
          value={form.requestDate}
          onChange={(e) => setForm({ ...form, requestDate: e.target.value })}
        />

        <input
          placeholder="의뢰경로"
          value={form.requestPath}
          onChange={(e) => setForm({ ...form, requestPath: e.target.value })}
        />

        <input
          placeholder="업체명"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />

        <input
          placeholder="담당자"
          value={form.manager}
          onChange={(e) => setForm({ ...form, manager: e.target.value })}
        />

        <input
          placeholder="연락처"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          placeholder="견적금액"
          value={formatMoney(form.estimateAmount)}
          onChange={(e) =>
            setForm({
              ...form,
              estimateAmount: e.target.value.replace(/[^0-9]/g, ""),
            })
          }
        />

        <input
          placeholder="계약금액"
          value={formatMoney(form.contractAmount)}
          onChange={(e) =>
            setForm({
              ...form,
              contractAmount: e.target.value.replace(/[^0-9]/g, ""),
            })
          }
        />

        <textarea
          placeholder="1차 의뢰내용"
          value={form.firstRequest}
          onChange={(e) => setForm({ ...form, firstRequest: e.target.value })}
        />

        <textarea
          placeholder="1차 처리결과"
          value={form.firstResult}
          onChange={(e) => setForm({ ...form, firstResult: e.target.value })}
        />

        {form.extraRequests.map((item, index) => (
          <div className="extraBox" key={index}>
            <h3>{item.title} 의뢰내용</h3>

            <textarea
              placeholder={`${item.title} 의뢰내용`}
              value={item.request}
              onChange={(e) => updateExtraRequest(index, "request", e.target.value)}
            />

            <textarea
              placeholder={`${item.title} 처리결과`}
              value={item.result}
              onChange={(e) => updateExtraRequest(index, "result", e.target.value)}
            />

            <p>
              작성자: {item.writer} / 작성시간: {item.writeTime}
            </p>
          </div>
        ))}

        <button type="button" onClick={addExtraRequest}>
          + 의뢰내용 추가
        </button>

        <select
          value={form.progress}
          onChange={(e) => setForm({ ...form, progress: e.target.value })}
        >
          {progressList.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <div className="uploadBox">
          <h3>도면첨부</h3>
          <input
            type="file"
            multiple
            onChange={(e) =>
              setForm({ ...form, drawings: Array.from(e.target.files) })
            }
          />
          {renderFiles(form.drawings)}
        </div>

        <div className="uploadBox">
          <h3>견적서첨부</h3>
          <input
            type="file"
            multiple
            onChange={(e) =>
              setForm({ ...form, quotes: Array.from(e.target.files) })
            }
          />
          {renderFiles(form.quotes)}
        </div>

        <div className="uploadBox">
          <h3>기타첨부</h3>
          <input
            type="file"
            multiple
            onChange={(e) =>
              setForm({ ...form, etcFiles: Array.from(e.target.files) })
            }
          />
          {renderFiles(form.etcFiles)}
        </div>

        <button className="saveButton" onClick={handleSave}>
          {editIndex !== null ? "수정 저장" : "저장"}
        </button>

        {editIndex !== null && <button onClick={resetForm}>수정 취소</button>}

        <button onClick={downloadExcel}>엑셀 다운로드</button>
      </div>

      <div className="searchBox">
        <input
          placeholder="검색: 관리번호, 업체명, 담당자, 연락처, 진행상황, 의뢰경로"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option>전체</option>
          {progressList.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />

        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />

        <button onClick={setTodayFilter}>오늘 접수건</button>
        <button onClick={resetSearch}>검색 초기화</button>
      </div>

      <p className="resultCount">조회 결과: {filteredEstimates.length}건</p>

      <div className="tableWrapper">
        <table>
          <thead>
            <tr>
              <th>관리번호</th>
              <th>접수일자</th>
              <th>업체명</th>
              <th>담당자</th>
              <th>견적금액</th>
              <th>계약금액</th>
              <th>진행상황</th>
              <th>작성자</th>
              <th>작성시간</th>
              <th>수정시간</th>
              <th>상세</th>
              <th>PDF</th>
              <th>수정</th>
              {isAdmin && <th>삭제</th>}
            </tr>
          </thead>

          <tbody>
            {filteredEstimates.map((item, index) => (
              <tr key={item.firebaseId}>
                <td>{item.manageNo}</td>
                <td>{item.requestDate}</td>
                <td>
                  <button
                    className="companyButton"
                    onClick={() => openCompanyHistory(item.company)}
                  >
                    {item.company}
                  </button>
                </td>
                <td>{item.manager}</td>
                <td>{formatMoney(item.estimateAmount)}</td>
                <td>{formatMoney(item.contractAmount)}</td>
                <td>
                  <span className={`statusBadge status-${item.progress}`}>
                    {item.progress}
                  </span>
                </td>
                <td>{item.writer}</td>
                <td>{item.writeTime}</td>
                <td>{item.modifyTime}</td>
                <td>
                  <button
                    className="detailButton"
                    onClick={() => setSelectedEstimate(item)}
                  >
                    상세보기
                  </button>
                </td>
                <td>
                  <button
                    className="detailButton"
                    onClick={() => printEstimatePdf(item)}
                  >
                    PDF
                  </button>
                </td>
                <td>
                  <button
                    className="detailButton"
                    onClick={() => handleEdit(index)}
                  >
                    수정
                  </button>
                </td>
                {isAdmin && (
                  <td>
                    <button
                      className="deleteButton"
                      onClick={() => handleDelete(index)}
                    >
                      삭제
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showHistory && (
        <div className="modalBackground">
          <div className="modalBox">
            <h2>업체 이력조회</h2>
            <h3>업체명: {companyHistory[0]?.company}</h3>
            <p>총 견적건수: {companyHistory.length}건</p>

            <div className="tableWrapper">
              <table>
                <thead>
                  <tr>
                    <th>관리번호</th>
                    <th>견적금액</th>
                    <th>계약금액</th>
                    <th>진행상황</th>
                    <th>작성시간</th>
                    <th>PDF</th>
                  </tr>
                </thead>

                <tbody>
                  {companyHistory.map((item, index) => (
                    <tr key={index}>
                      <td>{item.manageNo}</td>
                      <td>{formatMoney(item.estimateAmount)}</td>
                      <td>{formatMoney(item.contractAmount)}</td>
                      <td>
                        <span className={`statusBadge status-${item.progress}`}>
                          {item.progress}
                        </span>
                      </td>
                      <td>{item.writeTime}</td>
                      <td>
                        <button
                          className="detailButton"
                          onClick={() => printEstimatePdf(item)}
                        >
                          PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="closeButton" onClick={() => setShowHistory(false)}>
              닫기
            </button>
          </div>
        </div>
      )}

      {selectedEstimate && (
        <div className="modalBackground">
          <div className="modalBox">
            <h2>견적 상세보기</h2>

            <p><strong>관리번호:</strong> {selectedEstimate.manageNo}</p>
            <p><strong>접수일자:</strong> {selectedEstimate.requestDate}</p>
            <p><strong>의뢰경로:</strong> {selectedEstimate.requestPath}</p>
            <p><strong>업체명:</strong> {selectedEstimate.company}</p>
            <p><strong>담당자:</strong> {selectedEstimate.manager}</p>
            <p><strong>연락처:</strong> {selectedEstimate.phone}</p>
            <p><strong>견적금액:</strong> {formatMoney(selectedEstimate.estimateAmount)}원</p>
            <p><strong>계약금액:</strong> {formatMoney(selectedEstimate.contractAmount)}원</p>
            <p><strong>진행상황:</strong> {selectedEstimate.progress}</p>
            <p><strong>작성자:</strong> {selectedEstimate.writer}</p>
            <p><strong>작성시간:</strong> {selectedEstimate.writeTime}</p>
            <p><strong>수정자:</strong> {selectedEstimate.modifier}</p>
            <p><strong>수정시간:</strong> {selectedEstimate.modifyTime}</p>

            <hr />

            <h3>1차 의뢰내용</h3>
            <p>{selectedEstimate.firstRequest || "내용 없음"}</p>

            <h3>1차 처리결과</h3>
            <p>{selectedEstimate.firstResult || "내용 없음"}</p>

            <hr />

            <h3>추가 의뢰내용</h3>

            {selectedEstimate.extraRequests?.length === 0 && (
              <p>추가 의뢰내용 없음</p>
            )}

            {selectedEstimate.extraRequests?.map((item, index) => (
              <div className="extraDetailBox" key={index}>
                <h4>{item.title}</h4>
                <p><strong>의뢰내용:</strong> {item.request || "내용 없음"}</p>
                <p><strong>처리결과:</strong> {item.result || "내용 없음"}</p>
                <p>작성자: {item.writer} / 작성시간: {item.writeTime}</p>
              </div>
            ))}

            <hr />

            <h3>도면첨부</h3>
            {renderFiles(selectedEstimate.drawings)}

            <h3>견적서첨부</h3>
            {renderFiles(selectedEstimate.quotes)}

            <h3>기타첨부</h3>
            {renderFiles(selectedEstimate.etcFiles)}

            <button
              className="detailButton"
              onClick={() => printEstimatePdf(selectedEstimate)}
            >
              PDF 출력
            </button>

            <button
              className="closeButton"
              onClick={() => setSelectedEstimate(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}