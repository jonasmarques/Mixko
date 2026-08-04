const fs = require('fs');
let lines = fs.readFileSync('src/main.ts', 'utf8').split('\n');
// Keep only up to line 2134 (index 2133)
lines = lines.slice(0, 2134);
const suffix = `    let altsText = "";
    if (article.dataset.alts) {
        altsText = \\\` Descrição das imagens: \\\${article.dataset.alts}.\\\`;
    }
    if (article.dataset.uri) {
       announcePolite(\\\`\\\${repostText}\\\${replyContext}Post de \\\${author}: \\\${text}\\\${quoteText}\\\${altsText}\\\`);
	} else {
       announcePolite(\\\`\\\${text}\\\`); // For chat fallback
    }
}

// Hook into Wails Events for background sync updates
(window as any).runtime.EventsOn("new_timeline_posts", () => {
    if (currentTab === 'timeline') {
        // Here we could prepend posts if we had a proper state management, 
        // but for now re-triggering load is the safest for this vanilla structure.
        // Or we could show a "New posts available" button.
        // Let's just do a soft reload if we are at the top, or notify.
        if (window.scrollY < 100) {
            // Reload timeline silently if at top
            updateTimeline();
        }
    }
});

(window as any).runtime.EventsOn("new_notifications", () => {
    if (currentTab === 'notifications') {
        if (window.scrollY < 100) {
            updateNotifications();
        }
    } else {
        announcePolite("Novas notificações recebidas");
    }
});
`;

fs.writeFileSync('src/main.ts', lines.join('\n') + '\n' + suffix.replace(/\\\\`/g, '`').replace(/\\\\\\$/g, '$'));
