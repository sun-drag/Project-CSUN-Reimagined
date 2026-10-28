/* ========================================================
   CSUN STUDENT PORTAL - USU CAMPUS EVENTS CONTROLLER
   Target Link: https://csun.edu
======================================================== */

// 1. Live-matched fallback items from the exact USU category list link
/* ========================================================
   CSUN STUDENT PORTAL - USU CAMPUS EVENTS CONTROLLER
   Hardcoded Dataset: Late October through December 2026
======================================================== */

let allEvents = [
  // --- OCTOBER 2026 ---
  { 
    title: "Fall 2026 Intramural Sports Season", 
    start_date: "2026-10-26 08:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Cultural Jukebox Joint", 
    start_date: "2026-10-27 13:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "UPLIFT Community Voice Nights", 
    start_date: "2026-10-27 16:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "UndocuTalks: Safe Space", 
    start_date: "2026-10-28 12:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Bagel Bonding - Veterans Hub", 
    start_date: "2026-10-29 10:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Games Room: Smash Bros Tourney", 
    start_date: "2026-10-29 17:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Kinky Karaoke (Pride Center)", 
    start_date: "2026-10-29 18:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Red Cross First Aid/CPR Class", 
    start_date: "2026-10-30 09:00:00", 
    url: "https://csun.edu" 
  },

  // --- NOVEMBER 2026 ---
  { 
    title: "Día de los Muertos Community Altar", 
    start_date: "2026-11-02 11:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Matador Tuesday Food Trucks", 
    start_date: "2026-11-03 11:30:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Pride Center: Crafting Community", 
    start_date: "2026-11-04 15:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Games Room: Billiards Showdown", 
    start_date: "2026-11-05 16:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "USU Outdoor Movie Night: Fall Edition", 
    start_date: "2026-11-12 19:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "VRC: Transgender Day of Remembrance", 
    start_date: "2026-11-19 12:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Neon Bowling Night at Games Room", 
    start_date: "2026-11-20 18:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "International Students Thanksgiving Lunch", 
    start_date: "2026-11-24 12:00:00", 
    url: "https://csun.edu" 
  },

  // --- DECEMBER 2026 ---
  { 
    title: "Crunch Time Study Jam: Free Coffee", 
    start_date: "2026-12-01 08:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "USU De-Stress Fest: Therapy Dogs", 
    start_date: "2026-12-02 11:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Pride Center Winter Gala Celebration", 
    start_date: "2026-12-03 18:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "Games Room: Finals Week Free Play", 
    start_date: "2026-12-07 10:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "DREAM Center End of Semester Social", 
    start_date: "2026-12-09 14:00:00", 
    url: "https://csun.edu" 
  },
  { 
    title: "VRC Veterans Graduation Celebration", 
    start_date: "2026-12-11 17:00:00", 
    url: "https://csun.edu" 
  }
];


// Automatically sets tracking to today's date context
let currentDate = new Date(); 

// 2. Fetch data from the REST API equivalent of your category page link
  // Maps directly to the content stream behind /events/category/usu/list
  async function fetchCSUNEvents() {
  // DIRECT: Hit the CSUN API directly without any unreliable third-party proxies
  const apiUrl = 'https://csun.edu';

  try {
    const response = await fetch(apiUrl);
    const data = await response.json(); 
    
    if (data && data.events) {
      allEvents = data.events;
      console.log(`Successfully synchronized ${allEvents.length} live USU events directly from CSUN!`);
    }
    renderCalendar();
  } catch (error) {
    console.warn('Direct fetch blocked by browser CORS policy. Using local fallback items.', error);
    renderCalendar();
  }
}


// 3. Grid Rendering Engine
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const monthYearHeader = document.getElementById('month-year');
  const daysContainer = document.getElementById('calendar-days');
  
  if (!monthYearHeader || !daysContainer) return;

  monthYearHeader.textContent = `${monthNames[month]} ${year}`;
  daysContainer.innerHTML = '';

  const firstDayIndex = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Draw empty offset cells for formatting alignment
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.classList.add('day-cell', 'empty');
    daysContainer.appendChild(emptyCell);
  }

  // Populate dynamic daily boxes
  for (let day = 1; day <= daysInMonth; day++) {
    const dayCell = document.createElement('div');
    dayCell.classList.add('day-cell');
    
    const dateNumber = document.createElement('span');
    dateNumber.classList.add('date-num');
    dateNumber.textContent = day;
    dayCell.appendChild(dateNumber);

    // Highlight Today check condition
    const today = new Date();
    if (day === today.getDate() && month === today.getMonth() && year === today.getFullYear()) {
      dayCell.style.backgroundColor = '#fff5f5'; 
      dateNumber.style.color = '#d71920';       
    }

    const formattedCalendarDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = allEvents.filter(event => event.start_date && event.start_date.startsWith(formattedCalendarDate));
    
    dayEvents.forEach(event => {
      const eventLink = document.createElement('a');
      eventLink.classList.add('event-badge');
      // Uses the live event URL, fallback defaults back to your main target link page
      eventLink.href = event.url || "https://csun.edu";
      eventLink.target = '_blank';
      eventLink.title = event.title; 
      eventLink.textContent = event.title;
      dayCell.appendChild(eventLink);
    });

    daysContainer.appendChild(dayCell);
  }
}

// 4. Attach Navigation Controllers Safely
document.addEventListener("DOMContentLoaded", () => {
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');

  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() - 1);
      renderCalendar();
    });

    nextBtn.addEventListener('click', () => {
      currentDate.setMonth(currentDate.getMonth() + 1);
      renderCalendar();
    });
  }

  fetchCSUNEvents();
});
