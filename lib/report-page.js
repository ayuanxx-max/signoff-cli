(function () {
  var data = JSON.parse(document.getElementById("payload").textContent);
  var byDate = {};
  data.events.forEach(function (e) {
    (byDate[e.date] || (byDate[e.date] = [])).push(e);
  });
  var week = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  var sel = data.today;
  var month = data.today.slice(0, 7);
  var cal = document.getElementById("cal");
  var nav = document.getElementById("month-nav");
  var monthLabel = document.getElementById("month-label");
  var dayLabel = document.getElementById("day-label");
  var dayMeta = document.getElementById("day-meta");
  var dayBox = document.getElementById("day-events");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function row(e) {
    if (e.kind === "commit") {
      var tag = e.passed
        ? '<span class="chip pass">过闸</span>'
        : e.skipped
        ? '<span class="chip warn">跳过</span>'
        : '<span class="chip miss">无标记</span>';
      return (
        '<tr><td class="ts">' + esc(e.time.slice(0, 5)) + "</td><td>" + tag + "</td><td><code>" +
        esc(e.sha) + "</code> " + esc(e.subject) + '</td><td class="who">' + esc(e.who) +
        '</td><td class="num">' + esc(e.files) + " 文件</td></tr>"
      );
    }
    if (e.kind === "ticket") {
      var cls = e.decision === "allow" ? "pass" : e.decision === "deny" ? "fail" : "none";
      return (
        '<tr><td class="ts">' + esc(e.time.slice(0, 5)) + '</td><td><span class="chip ' + cls + '">' +
        esc(e.decision) + "</span></td><td>" + esc(e.action) + " <code>" + esc(e.target) +
        '</code></td><td colspan="2">回滚点 ' + esc(e.rollback || "—") + "</td></tr>"
      );
    }
    return (
      '<tr><td class="ts">' + esc(e.time.slice(0, 5)) + '</td><td class="label">' + esc(e.label) +
      '</td><td colspan="3">' + esc(e.detail) + "</td></tr>"
    );
  }

  function show(day) {
    sel = day;
    var list = byDate[day] || [];
    var d = new Date(day + "T00:00:00");
    dayLabel.textContent = day + " " + week[d.getDay()];
    dayMeta.textContent = list.length + " 条记录 · 点月历换一天";
    dayBox.innerHTML = list.length
      ? '<table class="timeline"><tbody>' + list.map(row).join("") + "</tbody></table>"
      : '<div class="empty">' + esc(day) + " 没有记录</div>";
  }

  function renderMonth(ym) {
    month = ym;
    var y = +ym.slice(0, 4);
    var m = +ym.slice(5, 7);
    var startPad = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    var total = new Date(y, m, 0).getDate();
    var cells = [];
    var i;
    for (i = 0; i < startPad; i++) cells.push('<td class="pad"></td>');
    for (var d = 1; d <= total; d++) {
      var key = y + "-" + pad2(m) + "-" + pad2(d);
      var n = (byDate[key] || []).length;
      var cls = (n ? "has" : "") + (key === data.today ? " today" : "") + (key === sel ? " sel" : "");
      cells.push(
        '<td class="' + cls.trim() + '" data-day="' + key + '" tabindex="0"><span>' + d + "</span>" +
        (n ? "<b>" + n + "</b>" : "") + "</td>"
      );
    }
    while (cells.length % 7) cells.push('<td class="pad"></td>');
    var rows = [];
    for (i = 0; i < cells.length; i += 7) rows.push("<tr>" + cells.slice(i, i + 7).join("") + "</tr>");
    cal.tBodies[0].innerHTML = rows.join("");
    cal.setAttribute("data-month", ym);
    if (monthLabel) monthLabel.textContent = ym;
  }

  cal.addEventListener("click", function (ev) {
    var td = ev.target.closest("td[data-day]");
    if (!td) return;
    sel = td.getAttribute("data-day");
    renderMonth(sel.slice(0, 7));
    show(sel);
  });
  cal.addEventListener("keydown", function (ev) {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    var td = ev.target.closest("td[data-day]");
    if (!td) return;
    ev.preventDefault();
    sel = td.getAttribute("data-day");
    renderMonth(sel.slice(0, 7));
    show(sel);
  });

  nav.addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-step]");
    if (!b) return;
    var step = Number(b.getAttribute("data-step"));
    if (step === 0) {
      sel = data.today;
      renderMonth(sel.slice(0, 7));
      show(sel);
      return;
    }
    var y = +month.slice(0, 4);
    var m = +month.slice(5, 7) + step;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    renderMonth(y + "-" + pad2(m));
  });

  // 一次只展开一个任务
  var tasks = document.querySelectorAll("details.task");
  Array.prototype.forEach.call(tasks, function (box) {
    box.addEventListener("toggle", function () {
      if (!box.open) return;
      Array.prototype.forEach.call(tasks, function (other) {
        if (other !== box) other.open = false;
      });
    });
  });

  renderMonth(month);
  show(sel);
})();
