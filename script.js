// SMS Manager Pro - Modern JavaScript Implementation
class SMSManager {
    constructor() {
        this.messages = [];
        this.filteredMessages = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.refreshing = false;
        this.exporting = false;
        this.selectedMessages = new Set();
        this.autoRefreshInterval = 0; // 0 = tắt tự động làm mới
        this.autoRefreshTimer = null;
        this.isAutoRefreshEnabled = false;
        this.userActivityTimer = null;
        this.userActivityEnabled = true; // Có thể tắt/bật tính năng này
        this.userActivityDelay = 30000; // 30 giây
        this.countdownTimer   = null;   // interval 1 s
        this.remainingSeconds = 0;      // giây còn lại
        this.countdownPaused  = false;  // true khi stopAutoRefresh / paused
        this.wasAutoRefreshActive = false; // Lưu trạng thái trước khi pause
        this.filters = {
            type: '',
            status: '',
            time: '',
            search: ''
        };
        this.currentView = 'all';
        this.isLoading = false;
        this.bulkOperations = {
            deleting: false,
            markingRead: false,
            exporting: false
            };
                    
        // Message templates
        this.templates = {
            greeting: "Xin chào! Cảm ơn bạn đã quan tâm đến dịch vụ của chúng tôi.",
            promotion: "🎉 Khuyến mãi đặc biệt! Giảm giá 50% cho tất cả sản phẩm. Mã: SALE50",
            reminder: "Nhắc nhở: Hóa đơn của bạn sẽ đến hạn thanh toán vào ngày mai. Vui lòng thanh toán đúng hạn.",
            confirmation: "Xác nhận đơn hàng #12345 đã được tiếp nhận. Chúng tôi sẽ liên hệ với bạn trong 24h."
        };

        this.init();
    }

    async init() {
        this.bindEvents();
        this.setupModals();
        this.setupAutoRefresh();
        this.pauseAutoRefreshOnUserActivity();
        
        const isConnected = await this.checkServerConnection();
        await this.loadMessages();
        this.updateStats();
        this.renderMessages();
        this.restoreAutoRefreshSettings(); // ← Thêm dòng này
        
        if (isConnected) {
            this.showWelcomeToast();
        }
    }


    
    // Bắt đầu tự động làm mới
    startAutoRefresh() {
        if (this.autoRefreshInterval <= 0) return;
        
        this.stopAutoRefresh();
        
        this.autoRefreshTimer = setInterval(async () => {
            if (!this.refreshing) {
                console.log(`Tự động làm mới sau ${this.autoRefreshInterval}s`);
                await this.loadMessages();
                this.updateStats();
                this.renderMessages();
                this.showToast('info', 'Đã làm mới', 'Dữ liệu được cập nhật tự động');
                
                // Reset countdown sau khi refresh
                this.remainingSeconds = this.autoRefreshInterval;
            }
        }, this.autoRefreshInterval * 1000);
        
        this.isAutoRefreshEnabled = true;
        this.countdownPaused = false;
        this.startCountdown(); // ← Thêm này
    }

    
    // Dừng tự động làm mới
    stopAutoRefresh() {
        if (this.autoRefreshTimer) {
            clearInterval(this.autoRefreshTimer);
            this.autoRefreshTimer = null;
        }
        this.isAutoRefreshEnabled = false;
        this.stopCountdown(); // ← Thêm này
        this.updateCountdownUI(); // ← Thay đổi từ updateAutoRefreshUI()
    }

    
    // Thiết lập khoảng thời gian tự động làm mới
    setAutoRefreshInterval(seconds) {
        this.autoRefreshInterval = seconds;
        
        if (seconds > 0) {
            this.startAutoRefresh();
            localStorage.setItem('autoRefreshInterval', seconds.toString());
        } else {
            this.stopAutoRefresh();
            localStorage.removeItem('autoRefreshInterval');
        }
    }
    
    // Cập nhật giao diện hiển thị trạng thái
    updateAutoRefreshUI() {
        const select = document.getElementById('autoRefreshSelect');
        const indicator = document.getElementById('autoRefreshIndicator');
        
        if (select) {
            select.value = this.autoRefreshInterval.toString();
        }
        
        if (indicator) {
            if (this.isAutoRefreshEnabled) {
                indicator.innerHTML = `<i class='bx bx-refresh bx-spin'></i> Tự động làm mới: ${this.autoRefreshInterval}s`;
                indicator.className = 'auto-refresh-indicator active';
            } else {
                indicator.innerHTML = `<i class='bx bx-refresh'></i> Tắt tự động làm mới`;
                indicator.className = 'auto-refresh-indicator';
            }
        }
    }
    
    // ---------------------------------------------------------------------
    // Thiết lập toàn bộ tính năng Auto-Refresh + User-Activity-Pause
    // GỌI MỘT LẦN trong init():  this.setupAutoRefresh();
    // ---------------------------------------------------------------------
    setupAutoRefresh() {
        /*----------------------------------------------------
         * 1. DOM Elements
         *---------------------------------------------------*/
        const refreshSelect      = document.getElementById('autoRefreshSelect');
        const activityCheckbox   = document.getElementById('userActivityPause');
        const delaySelect        = document.getElementById('activityDelay');
    
        /*----------------------------------------------------
         * 2. Khôi phục cấu hình đã lưu (nếu có)
         *---------------------------------------------------*/
        // – Chu kỳ auto-refresh
        const savedInterval = localStorage.getItem('autoRefreshInterval');
        if (savedInterval && refreshSelect) {
            refreshSelect.value = savedInterval;
            this.autoRefreshInterval = parseInt(savedInterval, 10);
            this.remainingSeconds = this.autoRefreshInterval; // ← Thêm này
        }
    
        // – Tạm dừng theo user-activity
        if (activityCheckbox) {
            const savedPause = localStorage.getItem('userActivityPause');
            activityCheckbox.checked = savedPause === null ? false : savedPause === 'true';
            this.userActivityEnabled = activityCheckbox.checked;
        }
    
        // – Thời gian trì hoãn khôi phục
        if (delaySelect) {
            const savedDelay = localStorage.getItem('userActivityDelay');
            if (savedDelay) {
                delaySelect.value = savedDelay;
                this.userActivityDelay = parseInt(savedDelay, 10) * 1000;
            }
        }
    
        /*----------------------------------------------------
         * 3. Bind sự kiện cho Auto-Refresh Select
         *---------------------------------------------------*/
        if (refreshSelect) {
            // Bảo đảm không gắn trùng listener
            refreshSelect.removeEventListener('change', this._onRefreshSelectChange);
            this._onRefreshSelectChange = (e) => {
                const seconds = parseInt(e.target.value, 10);
                this.setAutoRefreshInterval(seconds);
            };
            refreshSelect.addEventListener('change', this._onRefreshSelectChange);
        }
    
        /*----------------------------------------------------
         * 4. Bind sự kiện cho User-Activity Pause
         *---------------------------------------------------*/
        if (activityCheckbox) {
            activityCheckbox.removeEventListener('change', this._onActivityCheckboxChange);
            this._onActivityCheckboxChange = (e) => {
                const enabled = e.target.checked;
                this.toggleUserActivityPause(enabled);
                localStorage.setItem('userActivityPause', enabled);
            };
            activityCheckbox.addEventListener('change', this._onActivityCheckboxChange);
        }
    
        /*----------------------------------------------------
         * 5. Bind sự kiện cho Delay Select
         *---------------------------------------------------*/
        if (delaySelect) {
            delaySelect.removeEventListener('change', this._onDelaySelectChange);
            this._onDelaySelectChange = (e) => {
                const seconds = parseInt(e.target.value, 10);
                this.setUserActivityDelay(seconds);
                localStorage.setItem('userActivityDelay', seconds);
            };
            delaySelect.addEventListener('change', this._onDelaySelectChange);
        }
    
        /*----------------------------------------------------
         * 6. Khởi động các cơ chế
         *---------------------------------------------------*/
        // Auto-refresh ngay nếu giá trị > 0
        if (this.autoRefreshInterval > 0) {
            this.startAutoRefresh();
        }
    
        // Chỉ bind monitor user-activity một lần
        if (!this._userActivityBound) {
            this.pauseAutoRefreshOnUserActivity();
            this._userActivityBound = true;
        }
    
        // Cập nhật UI ban đầu với countdown
        this.updateCountdownUI(); // ← Thay đổi từ updateAutoRefreshUI()
        
        // Khởi động countdown nếu auto-refresh đang bật
        if (this.isAutoRefreshEnabled && this.autoRefreshInterval > 0) {
            this.startCountdown(); // ← Thêm này
        }
    }

    // Khôi phục cài đặt từ localStorage
    restoreAutoRefreshSettings() {
        const savedInterval = localStorage.getItem('autoRefreshInterval');
        if (savedInterval) {
            this.setAutoRefreshInterval(parseInt(savedInterval));
        }
    }
    
    // Test auto refresh functionality
    testAutoRefresh() {
        console.log('=== AUTO REFRESH STATUS ===');
        console.log('Current interval:', this.autoRefreshInterval);
        console.log('Timer active:', !!this.autoRefreshTimer);
        console.log('Is enabled:', this.isAutoRefreshEnabled);
        
        const select = document.getElementById('autoRefreshSelect');
        console.log('Select element found:', !!select);
        if (select) {
            console.log('Select value:', select.value);
        }
        
        const indicator = document.getElementById('autoRefreshIndicator');
        console.log('Indicator element found:', !!indicator);
    }

    // Tạm dừng auto refresh khi người dùng hoạt động
    pauseAutoRefreshOnUserActivity() {
        if (!this.userActivityEnabled) return;
        
        const resetUserActivity = () => {
            // Xóa timer cũ
            clearTimeout(this.userActivityTimer);
            
            // Tạm dừng auto refresh nếu đang chạy
            if (this.isAutoRefreshEnabled && !this.wasAutoRefreshActive) {
                console.log('🔄 Tạm dừng auto refresh do user activity');
                this.wasAutoRefreshActive = true;
                this.stopAutoRefresh();
                this.updateAutoRefreshUI('paused');
            }
            
            // Đặt timer để tiếp tục auto refresh
            this.userActivityTimer = setTimeout(() => {
                if (this.autoRefreshInterval > 0 && this.wasAutoRefreshActive) {
                    console.log('▶️ Tiếp tục auto refresh sau khi user không hoạt động');
                    this.wasAutoRefreshActive = false;
                    this.startAutoRefresh();
                }
            }, this.userActivityDelay);
        };
        
        // Lắng nghe các sự kiện người dùng
        const events = ['click', 'keypress', 'scroll', 'mousemove', 'touchstart', 'touchmove'];
        events.forEach(event => {
            document.addEventListener(event, resetUserActivity, { 
                passive: true,
                once: false
            });
        });
        
        console.log('👂 User activity monitoring enabled');
    }

    // Cập nhật giao diện hiển thị trạng thái
    updateAutoRefreshUI(status = null) {
        const select = document.getElementById('autoRefreshSelect');
        const indicator = document.getElementById('autoRefreshIndicator');
        
        if (select) {
            select.value = this.autoRefreshInterval.toString();
        }
        
        if (indicator) {
            if (status === 'paused') {
                // Trạng thái tạm dừng
                indicator.innerHTML = `<i class='bx bx-pause'></i><span>Tạm dừng</span>`;
                indicator.className = 'auto-refresh-indicator paused';
            } else if (this.isAutoRefreshEnabled) {
                // Đang hoạt động
                indicator.innerHTML = `<i class='bx bx-refresh bx-spin'></i><span>${this.autoRefreshInterval}s</span>`;
                indicator.className = 'auto-refresh-indicator active';
            } else {
                // Tắt
                indicator.innerHTML = `<i class='bx bx-refresh'></i><span>Tắt</span>`;
                indicator.className = 'auto-refresh-indicator';
            }
        }
    }

    // Bật/tắt user activity monitoring
    toggleUserActivityPause(enable) {
        this.userActivityEnabled = enable;
        
        if (!enable && this.userActivityTimer) {
            clearTimeout(this.userActivityTimer);
            this.userActivityTimer = null;
            
            // Khôi phục auto refresh nếu cần
            if (this.wasAutoRefreshActive && this.autoRefreshInterval > 0) {
                this.wasAutoRefreshActive = false;
                this.startAutoRefresh();
            }
        }
        
        console.log(`User activity pause: ${enable ? 'enabled' : 'disabled'}`);
    }
    
    /* Khởi động đếm ngược */
    startCountdown() {
        // Clear trước cho chắc
        this.stopCountdown();
    
        this.remainingSeconds = this.autoRefreshInterval;
        this.updateCountdownUI();
    
        this.countdownTimer = setInterval(() => {
            if (this.countdownPaused) return;      // đang pause (user activity)
            if (this.remainingSeconds > 0) {
                this.remainingSeconds--;
                this.updateCountdownUI();
            }
        }, 1000);
    }
    
    /* Dừng đếm ngược */
    stopCountdown() {
        if (this.countdownTimer) {
            clearInterval(this.countdownTimer);
            this.countdownTimer = null;
        }
    }
    
    /* Cập nhật hiển thị số giây */
    updateCountdownUI() {
        const indicator = document.getElementById('autoRefreshIndicator');
        if (!indicator) return;
    
        if (this.isAutoRefreshEnabled) {
            indicator.innerHTML =
                `<i class='bx bx-refresh bx-spin'></i><span>${this.remainingSeconds}s</span>`;
            indicator.className = 'auto-refresh-indicator active';
        } else if (this.countdownPaused) {
            indicator.innerHTML =
                `<i class='bx bx-pause'></i><span>Tạm dừng</span>`;
            indicator.className = 'auto-refresh-indicator paused';
        } else {
            indicator.innerHTML =
                `<i class='bx bx-refresh'></i><span>Tắt</span>`;
            indicator.className = 'auto-refresh-indicator';
        }
    }

    
    // Thay đổi thời gian delay
    setUserActivityDelay(seconds) {
        this.userActivityDelay = seconds * 1000;
        console.log(`User activity delay changed to: ${seconds}s`);
    }

    
    resetNewMessageForm() {
        try {
            console.log('Resetting form');
            const form = document.getElementById('newMessageForm');
            if (form) {
                form.reset();
            }
            
            // Reset character counter
            const charCount = document.getElementById('charCount');
            if (charCount) {
                charCount.textContent = '0';
            }
            
            console.log('Form reset completed');
        } catch (error) {
            console.error('Error in resetNewMessageForm:', error);
        }
    }
    
    async openNewMessageModal() {
        try {
            console.log('Opening new message modal - START');
            
            const modal = document.getElementById('newMessageModal');
            console.log('Modal element found:', !!modal);
            
            if (!modal) {
                console.error('Modal element not found');
                return;
            }
            
            modal.classList.add('active');
            document.body.style.overflow = 'hidden';
            console.log('Modal activated');
            
            // Reset form
            try {
                this.resetNewMessageForm();
                console.log('Form reset completed');
            } catch (error) {
                console.error('Error resetting form:', error);
            }
            
            // Focus input after modal display
            setTimeout(() => {
                try {
                    const phoneInput = document.getElementById('recipientPhone');
                    if (phoneInput) {
                        phoneInput.focus();
                        console.log('Input focused');
                    } else {
                        console.error('Phone input not found');
                    }
                } catch (error) {
                    console.error('Error focusing input:', error);
                }
            }, 100);
            
            // Check connection after modal is displayed
            setTimeout(async () => {
                try {
                    console.log('Starting connection check after modal display');
                    await this.checkConnectionStatus();
                } catch (error) {
                    console.error('Error in connection check:', error);
                }
            }, 300);
            
        } catch (error) {
            console.error('Error in openNewMessageModal:', error);
        }
    }


    
    async checkConnectionStatus() {
        try {
            console.log('checkConnectionStatus started');
            
            console.log('Calling updateConnectionStatus with checking');
            this.updateConnectionStatus('checking');
            
            const isConnected = await this.testConnection();
            console.log('Connection result:', isConnected);
            
            if (isConnected) {
                console.log('Calling updateConnectionStatus with connected');
                this.updateConnectionStatus('connected');
            } else {
                console.log('Calling updateConnectionStatus with disconnected');
                this.updateConnectionStatus('disconnected');
            }
        } catch (error) {
            console.error('Connection check failed:', error);
            try {
                this.updateConnectionStatus('disconnected');
            } catch (updateError) {
                console.error('Error updating status to disconnected:', updateError);
            }
        }
    }



    
    async testConnection() {
        try {
            const baseUrl = window.location.origin;
            
            // Test với timeout ngắn để tránh treo
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 seconds
            
            const response = await fetch(`${baseUrl}/cgi-bin/sms-send`, {
                method: 'GET',
                headers: { 
                    'Accept': '*/*',
                    'Cache-Control': 'no-cache' 
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            // Kiểm tra response status
            return response.status < 500; // Accept 200, 400, 404 but not 500+
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Connection test timeout');
            } else {
                console.log('Connection test failed:', error.message);
            }
            return false;
        }
    }

    // THÊM METHOD NÀY VÀO NGAY ĐÂY
    updateConnectionStatus(status) {
        console.log('updateConnectionStatus called with:', status);
        
        // Thử nhiều cách tìm element
        let statusElement = document.getElementById('connectionStatus');
        
        if (!statusElement) {
            statusElement = document.querySelector('.connection-status');
        }
        
        if (!statusElement) {
            statusElement = document.querySelector('#newMessageModal .connection-status');
        }
        
        console.log('statusElement found:', statusElement);
        
        if (!statusElement) {
            console.error('connectionStatus element not found anywhere');
            // Tạo element tạm thời để test
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = `
                <div style="padding: 10px; background: yellow; margin: 10px;">
                    Status: ${status}
                </div>
            `;
            document.body.appendChild(tempDiv);
            return;
        }
        
        // Tiếp tục với logic update bình thường...
        const textElement = statusElement.querySelector('span');
        if (textElement) {
            switch (status) {
                case 'checking':
                    textElement.textContent = 'Đang kiểm tra kết nối...';
                    textElement.style.color = 'blue';
                    break;
                case 'connected':
                    textElement.textContent = 'Kết nối server thành công';
                    textElement.style.color = 'green';
                    break;
                case 'disconnected':
                    textElement.textContent = 'Không thể kết nối server';
                    textElement.style.color = 'red';
                    break;
            }
            console.log('Status updated to:', textElement.textContent);
        }
    }


    
    // Test function - gọi trong console
    async testConnectionManual() {
        console.log('Manual test started');
        this.updateConnectionStatus('checking');
        
        setTimeout(() => {
            this.updateConnectionStatus('connected');
        }, 2000);
    }





    // Thêm method này để check server connection cho init
    async checkServerConnection() {
        const isConnected = await this.testConnection();
        
        if (!isConnected) {
            this.showToast('warning', 'Cảnh báo kết nối', 'Không thể kết nối đến server SMS. Sử dụng dữ liệu mẫu.');
        }
        
        return isConnected;
    }

    bindEvents() {
        // --- SAFE BINDING FOR MAIN BUTTONS ---
    
        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            const newBtn = exportBtn.cloneNode(true);
            exportBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Export button clicked');
                this.exportMessages();
            });
        }
    
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            const newBtn = refreshBtn.cloneNode(true);
            refreshBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.refreshMessages();
            });
        }
    
        // New Message button
        const newMessageBtn = document.getElementById('newMessageBtn');
        if (newMessageBtn) {
            const newBtn = newMessageBtn.cloneNode(true);
            newMessageBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openNewMessageModal();
            });
        }
    
        // Bulk delete button
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        if (bulkDeleteBtn) {
            const newBtn = bulkDeleteBtn.cloneNode(true);
            bulkDeleteBtn.replaceWith(newBtn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.bulkDeleteMessages();
            });
        }
    
        // --- OTHER EVENT BINDINGS ---
    
        // View tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchView(e.target.dataset.view);
            });
        });
    
        // Filters
        document.getElementById('applyFilter')?.addEventListener('click', () => {
            this.applyFilters();
        });
    
        document.getElementById('clearFilter')?.addEventListener('click', () => {
            this.clearFilters();
        });
    
        // Search input
        const searchInput = document.getElementById('searchInput');
        let searchTimeout;
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.filters.search = e.target.value;
                    this.applyFilters();
                }, 500);
            });
        }
    
        // Bulk actions
        document.getElementById('selectAllBtn')?.addEventListener('click', () => {
            this.toggleSelectAll();
        });
    
        document.getElementById('markReadBtn')?.addEventListener('click', () => {
            this.markSelectedAsRead();
        });
    
        document.getElementById('deleteSelectedBtn')?.addEventListener('click', () => {
            this.deleteSelectedMessages();
        });
    
        // Pagination
        const itemsPerPage = document.getElementById('itemsPerPage');
        if (itemsPerPage) {
            itemsPerPage.addEventListener('change', (e) => {
                this.itemsPerPage = parseInt(e.target.value);
                this.currentPage = 1;
                this.renderMessages();
            });
        }
    
        // New message form
        const messageForm = document.getElementById('newMessageForm');
        if (messageForm) {
            messageForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        }
    
        // Character counter
        const messageContent = document.getElementById('messageContent');
        if (messageContent) {
            messageContent.addEventListener('input', () => {
                this.updateCharCount();
            });
        }
    
        // Template selector
        const templateSelect = document.getElementById('messageTemplate');
        if (templateSelect) {
            templateSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    messageContent.value = this.templates[e.target.value];
                    this.updateCharCount();
                }
            });
        }
    
        // Modal close (click outside or close icon)
        document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
            el.addEventListener('click', (e) => {
                if (e.target === el) {
                    this.closeModals();
                }
            });
        });
    
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModals();
            }
            if (e.ctrlKey && e.key === 'n') {
                e.preventDefault();
                this.openNewMessageModal();
            }
            if (e.ctrlKey && e.key === 'r') {
                e.preventDefault();
                this.refreshMessages();
            }
        });
        
        // Đóng modal bằng nút X
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-close') || 
                e.target.closest('.modal-close')) {
                
                const modal = e.target.closest('.modal');
                if (modal) {
                    const modalId = modal.getAttribute('id');
                    this.closeModal(modalId);
                }
            }
        });
        
        // Đóng modal bằng click overlay
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                const modal = e.target.closest('.modal');
                if (modal) {
                    const modalId = modal.getAttribute('id');
                    this.closeModal(modalId);
                }
            }
        });
        
        // Đóng modal bằng phím ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const activeModal = document.querySelector('.modal.active');
                if (activeModal) {
                    const modalId = activeModal.getAttribute('id');
                    this.closeModal(modalId);
                }
            }
        });
    }


    // Modal Management
    setupModals() {
        // Cancel buttons
        document.getElementById('cancelNewMessage').addEventListener('click', () => {
            this.closeNewMessageModal();
        });
    }

    openNewMessageModal() {
        console.log('=== OPENING MODAL START ===');
        
        try {
            const modal = document.getElementById('newMessageModal');
            console.log('Modal found:', !!modal);
            
            if (modal) {
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
                console.log('Modal should be visible now');
                
                // Simple connection check without complex timing
                setTimeout(() => {
                    console.log('Running connection check...');
                    this.simpleConnectionCheck();
                }, 500);
            }
        } catch (error) {
            console.error('Modal error:', error);
        }
        
        console.log('=== OPENING MODAL END ===');
    }
    
    // Method đóng modal
    closeModal(modalId) {
        try {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.classList.remove('active');
                document.body.style.overflow = '';
                
                // Reset form nếu là modal tạo tin nhắn
                if (modalId === 'newMessageModal') {
                    this.resetNewMessageForm();
                }
            }
        } catch (error) {
            console.error('Error closing modal:', error);
        }
    }
    
    // Method đóng modal cụ thể
    closeNewMessageModal() {
        this.closeModal('newMessageModal');
    }
    
    closeMessageDetailModal() {
        this.closeModal('messageDetailModal');
    }

    
    // Simplified connection check
    async simpleConnectionCheck() {
        console.log('Connection check started');
        
        const statusElement = document.getElementById('connectionStatus');
        if (!statusElement) return;
        
        const span = statusElement.querySelector('span');
        const icon = statusElement.querySelector('i');
        
        if (!span) return;
        
        // Set checking state
        span.textContent = 'Đang kiểm tra kết nối...';
        span.style.color = '#3b82f6'; // Blue color
        if (icon) icon.className = 'bx bx-loader-alt bx-spin';
        
        try {
            // Thử kết nối bình thường trước
            let isConnected = await this.testConnection();
            
            // Nếu thất bại, thử retry
            if (!isConnected) {
                console.log('Initial connection failed, starting retry...');
                isConnected = await this.retryConnection();
            }
            
            if (isConnected) {
                span.textContent = 'Kết nối server thành công';
                span.style.color = 'green';
                if (icon) icon.className = 'bx bx-check-circle';
                
                // Enable send button
                const sendBtn = document.getElementById('sendMessageBtn');
                if (sendBtn) {
                    sendBtn.disabled = false;
                    sendBtn.title = '';
                }
                
            } else {
                span.textContent = 'Không thể kết nối server (đã thử 3 lần)';
                span.style.color = 'red';
                if (icon) icon.className = 'bx bx-error-circle';
                
                // Disable send button  
                const sendBtn = document.getElementById('sendMessageBtn');
                if (sendBtn) {
                    sendBtn.disabled = true;
                    sendBtn.title = 'Server không khả dụng';
                }
                
                // Show toast notification
                if (this.showToast) {
                    this.showToast('error', 'Lỗi kết nối', 'Không thể kết nối đến server SMS sau 3 lần thử');
                }
            }
            
            console.log('Connection status updated to:', span.textContent);
            
        } catch (error) {
            span.textContent = 'Lỗi kiểm tra kết nối';
            span.style.color = 'red';
            if (icon) icon.className = 'bx bx-error-circle';
            console.error('Connection check error:', error);
        }
    }


    closeNewMessageModal() {
        const modal = document.getElementById('newMessageModal');
        modal.classList.remove('active');
        document.body.style.overflow = '';
        this.resetNewMessageForm();
    }

    openMessageDetailModal(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        const modal = document.getElementById('messageDetailModal');
        const content = document.getElementById('messageDetailContent');
        
        content.innerHTML = this.renderMessageDetail(message);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Bind detail modal events
        this.bindMessageDetailEvents(message);
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }

    // Data Management
    async loadMessages() {
        this.setLoading(true);
        
        try {
            console.log('Loading messages from backend...'); // Debug log
            
            const response = await this.fetchMessages();
            
            if (response && response.length > 0) {
                this.messages = response;
                this.filteredMessages = [...this.messages];
                
                console.log('Loaded messages:', this.messages); // Debug log
                this.showToast('success', 'Tải dữ liệu thành công', `Đã tải ${this.messages.length} tin nhắn từ server`);
            } else {
                // Nếu không có data từ backend, sử dụng mock data
                console.log('No data from backend, using mock data');
                this.messages = this.generateMockData();
                this.filteredMessages = [...this.messages];
                this.showToast('warning', 'Sử dụng dữ liệu mẫu', 'Không có dữ liệu từ server');
            }
            
        } catch (error) {
            console.error('Error loading messages:', error);
            this.messages = this.generateMockData();
            this.filteredMessages = [...this.messages];
            this.showToast('error', 'Lỗi kết nối', 'Không thể tải dữ liệu từ server, sử dụng dữ liệu mẫu');
        }
        
        this.setLoading(false);
    }

    async fetchMessages() {
        try {
            const baseUrl = window.location.origin;
            const response = await fetch(`${baseUrl}/cgi-bin/sms-read`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json,text/plain,*/*',
                    'Cache-Control': 'no-cache'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('Raw backend response:', data); // Debug log
                return this.parseBackendResponse(data);
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Backend fetch error:', error);
            this.showToast('warning', 'Lỗi tải dữ liệu', 'Không thể kết nối backend, sử dụng dữ liệu mẫu');
            return null;
        }
    }
    


    // Helper method để parse text response nếu backend không trả JSON
    parseTextResponse(text) {
        try {
            // Thử parse JSON nếu có thể
            return JSON.parse(text);
        } catch {
            // Nếu không phải JSON, trả về empty array
            console.warn('Backend response is not JSON:', text);
            return [];
        }
    }

    parseBackendResponse(data) {
        try {
            let messagesArray = [];
            
            if (data && data.messages && Array.isArray(data.messages)) {
                messagesArray = data.messages;
            } else if (Array.isArray(data)) {
                messagesArray = data;
            }
    
            console.log('=== PARSING BACKEND RESPONSE ===');
            console.log('Total messages:', messagesArray.length);
    
            return messagesArray.map(item => {
                console.log('Raw message data:', {
                    id: item.id,
                    read_status: item.read_status, // Kiểm tra field này
                    state: item.state,
                    type: item.type
                });
    
                const mappedMessage = {
                    id: item.id?.toString() || this.generateId(),
                    phone: item.number || '',
                    content: item.text || '',
                    type: item.type === 'deliver' ? 'received' : 'sent',
                    timestamp: new Date(item.date),
                    // QUAN TRỌNG: Kiểm tra backend trả về field gì cho read status
                    read: this.determineReadStatus(item),
                    status: this.mapBackendState(item.state, item.type),
                    storage: item.storage || 'unknown',
                    _raw: item
                };
    
                console.log('Mapped read status:', {
                    id: mappedMessage.id,
                    read: mappedMessage.read,
                    originalData: item
                });
    
                return mappedMessage;
            }).sort((a, b) => b.timestamp - a.timestamp);
    
        } catch (error) {
            console.error('Error parsing backend response:', error);
            return [];
        }
    }
    
    // Cập nhật method determineReadStatus
    determineReadStatus(item) {
        // Kiểm tra field read_status từ backend
        if (item.read_status !== undefined) {
            return item.read_status === 1 || item.read_status === true;
        }
        
        // Fallback logic
        if (item.read !== undefined) return item.read;
        if (item.is_read !== undefined) return item.is_read;
        
        // Tin nhắn gửi thường được coi là đã đọc
        if (item.type === 'submit') return true;
        
        // Mặc định tin nhắn nhận được coi là chưa đọc
        return false;
    }

        
    mapBackendState(state, type) {
        // Map backend state to frontend status
        const stateMap = {
            'sent': 'sent',
            'received': 'received', 
            'delivered': 'delivered',
            'failed': 'failed',
            'pending': 'pending'
        };

        return stateMap[state] || (type === 'submit' ? 'sent' : 'received');
    }

    generateMockData() {
        const mockMessages = [];
        const phones = ['0901234567', '0912345678', '0923456789', '0934567890', '0945678901'];
        const sampleContents = [
            'Xin chào! Tôi muốn hỏi về sản phẩm của bạn.',
            'Cảm ơn bạn đã hỗ trợ. Rất hài lòng với dịch vụ.',
            'Đơn hàng của tôi đã được giao chưa?',
            'Tôi cần hỗ trợ về việc thanh toán.',
            'Sản phẩm rất tốt, tôi sẽ giới thiệu cho bạn bè.',
            'Có khuyến mãi gì trong tháng này không?',
            'Thời gian giao hàng là bao lâu?',
            'Tôi muốn đổi trả sản phẩm.',
            'Cửa hàng có chi nhánh ở đâu?',
            'Cảm ơn bạn đã tư vấn nhiệt tình.'
        ];

        for (let i = 0; i < 150; i++) {
            const isReceived = Math.random() > 0.6;
            const timestamp = new Date();
            timestamp.setHours(timestamp.getHours() - Math.random() * 24 * 30); // Last 30 days

            mockMessages.push({
                id: this.generateId(),
                phone: phones[Math.floor(Math.random() * phones.length)],
                content: sampleContents[Math.floor(Math.random() * sampleContents.length)],
                type: isReceived ? 'received' : 'sent',
                timestamp: timestamp,
                read: Math.random() > 0.3,
                status: Math.random() > 0.1 ? 'delivered' : 'failed'
            });
        }

        return mockMessages.sort((a, b) => b.timestamp - a.timestamp);
    }

    async sendMessage() {
        const phone = document.getElementById('recipientPhone').value.trim();
        const content = document.getElementById('messageContent').value.trim();

        if (!phone || !content) {
            this.showToast('error', 'Lỗi', 'Vui lòng điền đầy đủ thông tin');
            return;
        }

        if (!this.validatePhone(phone)) {
            this.showToast('error', 'Số điện thoại không hợp lệ', 'Vui lòng nhập số điện thoại đúng định dạng');
            return;
        }

        // Disable form during sending
        const submitBtn = document.querySelector('#newMessageForm button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Đang gửi...';

        try {
            const success = await this.submitMessage(phone, content);
            
            if (success) {
                // Add to local messages for immediate UI update
                const newMessage = {
                    id: this.generateId(),
                    phone: phone,
                    content: content,
                    type: 'sent',
                    timestamp: new Date(),
                    read: true,
                    status: 'sent'
                };

                this.messages.unshift(newMessage);
                this.applyFilters();
                this.updateStats();
                this.renderMessages();

                this.closeNewMessageModal();
                this.showToast('success', 'Gửi thành công', 'Tin nhắn đã được gửi đến ' + phone);
            }
        } catch (error) {
            this.showToast('error', 'Gửi thất bại', error.message || 'Có lỗi xảy ra khi gửi tin nhắn');
        } finally {
            // Re-enable form
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    async submitMessage(phone, content) {
        try {
            // Sử dụng định dạng URL giống như curl command của bạn
            const baseUrl = window.location.origin; // Tự động lấy domain hiện tại
            const url = `${baseUrl}/cgi-bin/sms-send?number=${encodeURIComponent(phone)}&text=${encodeURIComponent(content)}`;
            
            const response = await fetch(url, {
                method: 'GET', // Sử dụng GET như trong curl command
                headers: {
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
                    'Cache-Control': 'no-cache'
                },
                // Thêm timeout để tránh treo request
                signal: AbortSignal.timeout(30000) // 30 seconds timeout
            });

            if (response.ok) {
                // Kiểm tra response content để xác định thành công
                const responseText = await response.text();
                
                // Log response để debug (có thể bỏ khi production)
                console.log('SMS Send Response:', responseText);
                
                // Kiểm tra response có chứa thông báo lỗi không
                if (responseText.toLowerCase().includes('error') || 
                    responseText.toLowerCase().includes('failed') ||
                    responseText.toLowerCase().includes('fail')) {
                    throw new Error('Server báo lỗi khi gửi tin nhắn');
                }
                
                return true;
            } else {
                throw new Error(`Server trả về lỗi: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            console.error('Send message error:', error);
            
            if (error.name === 'AbortError') {
                throw new Error('Gửi tin nhắn bị timeout, vui lòng thử lại');
            } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
                throw new Error('Không thể kết nối đến server');
            } else {
                throw error;
            }
        }
    }

    // Thêm method để test connection
    async testConnection() {
        console.log('testConnection started');
        try {
            const baseUrl = window.location.origin;
            console.log('Testing URL:', `${baseUrl}/cgi-bin/sms-send`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log('Connection test timeout');
                controller.abort();
            }, 5000);
            
            const response = await fetch(`${baseUrl}/cgi-bin/sms-send`, {
                method: 'GET',
                headers: { 
                    'Accept': '*/*',
                    'Cache-Control': 'no-cache' 
                },
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            console.log('Response received:', response.status, response.ok);
            
            // ✅ CHỈ coi là thành công khi status 200-299
            const result = response.ok; // thay vì response.status < 500
            console.log('Connection test result:', result);
            return result;
            
        } catch (error) {
            console.log('Connection test error:', error.name, error.message);
            if (error.name === 'AbortError') {
                console.log('Connection test timeout');
            }
            return false;
        }
    }
    
    // THÊM CÁC METHOD MỚI NGAY ĐOẠN NÀY (sau testConnection)
    async retryConnection() {
        console.log('Starting connection retry...');
        for (let i = 0; i < 3; i++) {
            console.log(`Retry attempt ${i + 1}/3`);
            
            const result = await this.testConnection();
            if (result) {
                console.log('Connection successful on retry', i + 1);
                return true;
            }
            
            // Hiển thị retry indicator
            this.showConnectionTimeout(`Thử lại lần ${i + 1}/3...`);
            
            // Đợi 1 giây trước khi thử lại
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('All retry attempts failed');
        return false;
    }

    showConnectionTimeout(message = 'Timeout - Đang thử lại...') {
        const span = document.querySelector('#connectionStatus span');
        const icon = document.querySelector('#connectionStatus i');
        
        if (span) {
            span.textContent = message;
            span.style.color = 'orange';
        }
        
        if (icon) {
            icon.className = 'bx bx-error-circle';
        }
        
        console.log('Showing timeout message:', message);
    }

    async deleteMessage(messageId) {
        if (!confirm('Bạn có chắc chắn muốn xóa tin nhắn này?')) {
            return false;
        }
    
        try {
            console.log('Deleting message:', messageId);
            
            const baseUrl = window.location.origin;
            // Sử dụng parameter "ids" thay vì "id"
            const url = `${baseUrl}/cgi-bin/sms-delete?ids=${encodeURIComponent(messageId)}`;
            
            console.log('Delete URL:', url);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json,*/*',
                    'Cache-Control': 'no-cache'
                }
            });
    
            console.log('Delete response status:', response.status);
            
            if (response.ok) {
                const result = await response.json();
                console.log('Delete response:', result);
                
                if (result.success && result.deleted_count > 0) {
                    // Remove from local messages
                    this.messages = this.messages.filter(m => m.id !== messageId);
                    this.selectedMessages.delete(messageId);
                    this.applyFilters();
                    this.updateStats();
                    this.renderMessages();
                    this.closeModals();
                    
                    this.showToast('success', 'Đã xóa', `Đã xóa tin nhắn thành công`);
                    return true;
                } else {
                    this.showToast('error', 'Xóa thất bại', result.message || 'Không thể xóa tin nhắn');
                    return false;
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Delete message error:', error);
            this.showToast('error', 'Lỗi xóa tin nhắn', error.message || 'Có lỗi xảy ra khi xóa');
            return false;
        }
    }


    // Thêm method để kiểm tra và hiển thị trạng thái connection
    async checkServerConnection() {
        const isConnected = await this.testConnection();
        
        if (!isConnected) {
            this.showToast('warning', 'Cảnh báo kết nối', 'Không thể kết nối đến server SMS. Sử dụng dữ liệu mẫu.');
        }
        
        return isConnected;
    }

    // Filtering and Search
    applyFilters() {
        let filtered = [...this.messages];

        // Filter by view type
        if (this.currentView === 'received') {
            filtered = filtered.filter(m => m.type === 'received');
        } else if (this.currentView === 'sent') {
            filtered = filtered.filter(m => m.type === 'sent');
        }

        // Apply filters
        if (this.filters.type) {
            filtered = filtered.filter(m => m.type === this.filters.type);
        }

        if (this.filters.status) {
            const isUnread = this.filters.status === 'unread';
            filtered = filtered.filter(m => m.read !== isUnread);
        }

        if (this.filters.time) {
            filtered = this.filterByTime(filtered, this.filters.time);
        }

        if (this.filters.search) {
            const search = this.filters.search.toLowerCase();
            filtered = filtered.filter(m => 
                m.phone.includes(search) || 
                m.content.toLowerCase().includes(search)
            );
        }

        this.filteredMessages = filtered;
        this.currentPage = 1;
        this.renderMessages();
        this.updateBulkActionsVisibility();
    }
    
    showBulkDeleteConfirmation(count) {
        return new Promise((resolve) => {
            // Create custom confirmation modal instead of basic confirm()
            const modal = document.createElement('div');
            modal.className = 'bulk-confirm-modal';
            modal.innerHTML = `
                <div class="modal-overlay"></div>
                <div class="modal-content">
                    <h3>Xác nhận xóa hàng loạt</h3>
                    <p>Bạn có chắc chắn muốn xóa <strong>${count}</strong> tin nhắn đã chọn?</p>
                    <p class="warning">Hành động này không thể hoàn tác.</p>
                    <div class="modal-actions">
                        <button class="btn btn-outline cancel-btn">Hủy</button>
                        <button class="btn btn-danger confirm-btn">Xóa ${count} tin nhắn</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            modal.querySelector('.cancel-btn').onclick = () => {
                modal.remove();
                resolve(false);
            };
            
            modal.querySelector('.confirm-btn').onclick = () => {
                modal.remove();
                resolve(true);
            };
        });
    }


    filterByTime(messages, timeFilter) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        switch (timeFilter) {
            case 'today':
                return messages.filter(m => m.timestamp >= today);
            
            case 'yesterday':
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                return messages.filter(m => 
                    m.timestamp >= yesterday && m.timestamp < today
                );
            
            case 'thisWeek':
                const weekStart = new Date(today);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                return messages.filter(m => m.timestamp >= weekStart);
            
            case 'lastWeek':
                const lastWeekStart = new Date(today);
                lastWeekStart.setDate(lastWeekStart.getDate() - lastWeekStart.getDay() - 7);
                const lastWeekEnd = new Date(lastWeekStart);
                lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
                return messages.filter(m => 
                    m.timestamp >= lastWeekStart && m.timestamp < lastWeekEnd
                );
            
            case 'thisMonth':
                const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                return messages.filter(m => m.timestamp >= monthStart);
            
            case 'lastMonth':
                const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 1);
                return messages.filter(m => 
                    m.timestamp >= lastMonthStart && m.timestamp < lastMonthEnd
                );
            
            default:
                return messages;
        }
    }

    clearFilters() {
        this.filters = { type: '', status: '', time: '', search: '' };
        
        // Reset form elements
        document.getElementById('messageType').value = '';
        document.getElementById('readStatus').value = '';
        document.getElementById('timeFilter').value = '';
        document.getElementById('searchInput').value = '';
        
        this.applyFilters();
        this.showToast('info', 'Bộ lọc đã được xóa', 'Hiển thị tất cả tin nhắn');
    }

    // View Management
    switchView(view) {
        this.currentView = view;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-view="${view}"]`).classList.add('active');
        
        this.applyFilters();
    }

    // Rendering
    renderMessages() {
        const container = document.getElementById('messagesList');
        const loadingElement = document.getElementById('messagesLoading');
        const emptyElement = document.getElementById('messagesEmpty');
        
        if (this.isLoading) {
            loadingElement.style.display = 'flex';
            container.style.display = 'none';
            emptyElement.style.display = 'none';
            return;
        }
        
        loadingElement.style.display = 'none';
        
        if (this.filteredMessages.length === 0) {
            container.style.display = 'none';
            emptyElement.style.display = 'flex';
            return;
        }
        
        emptyElement.style.display = 'none';
        container.style.display = 'block';

        // Pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageMessages = this.filteredMessages.slice(startIndex, endIndex);

        // Render messages
        container.innerHTML = pageMessages.map(message => this.renderMessageItem(message)).join('');

        // Bind message events
        this.bindMessageEvents();
        
        // Render pagination
        this.renderPagination();
    }

    renderMessageItem(message) {
        const isSelected = this.selectedMessages.has(message.id);
        const timeAgo = this.getTimeAgo(message.timestamp);
        const preview = this.truncateText(message.content, 100);
        
        // Xử lý hiển thị số điện thoại (loại bỏ +84 nếu có)
        const displayPhone = message.phone.startsWith('+84') 
            ? '0' + message.phone.substring(3) 
            : message.phone;

        return `
            <div class="message-item ${message.read ? '' : 'unread'} ${isSelected ? 'selected' : ''}" 
                 data-message-id="${message.id}">
                <div class="message-checkbox">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="smsManager.toggleMessageSelection('${message.id}')">
                </div>
                
                <div class="message-avatar ${message.type}">
                    ${message.type === 'received' ? '📨' : '📤'}
                </div>
                
                <div class="message-content" onclick="smsManager.openMessageDetailModal('${message.id}')">
                    <div class="message-header">
                        <div class="message-phone">${displayPhone}</div>
                        <div class="message-meta">
                            <span class="message-type ${message.type}">
                                <i class='bx ${message.type === 'received' ? 'bx-down-arrow-alt' : 'bx-up-arrow-alt'}'></i>
                                ${message.type === 'received' ? 'Nhận' : 'Gửi'}
                            </span>
                            <span class="message-time">${timeAgo}</span>
                            ${message.storage ? `<span class="message-storage">${message.storage.toUpperCase()}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="message-text">${preview}</div>
                    
                    <div class="message-footer">
                        <div class="message-status">
                            ${this.renderMessageStatus(message)}
                        </div>
                        <div class="message-actions">
                            ${message.type === 'received' ? `
                                <button class="message-action-btn" onclick="event.stopPropagation(); smsManager.replyToMessage('${message.id}')" 
                                        title="Trả lời">
                                    <i class='bx bx-reply'></i>
                                </button>
                            ` : ''}
                            <button class="message-action-btn delete" onclick="event.stopPropagation(); smsManager.deleteMessage('${message.id}')" 
                                    title="Xóa">
                                <i class='bx bx-trash'></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderMessageStatus(message) {
        if (!message) return '<span class="status-badge unknown">Không xác định</span>';
        
        // Xử lý tin nhắn nhận được
        if (message.type === 'received') {
            if (!message.read) {
                return '<span class="status-badge unread"><i class="bx bx-error-circle"></i> Chưa đọc</span>';
            } else {
                return '<span class="status-badge read"><i class="bx bx-check-circle"></i> Đã đọc</span>';
            }
        }
        
        // Xử lý tin nhắn gửi đi
        if (message.type === 'sent') {
            switch (message.status) {
                case 'sent':
                    return '<span class="status-badge sent"><i class="bx bx-check"></i> Đã gửi</span>';
                case 'delivered':
                    return '<span class="status-badge delivered"><i class="bx bx-check-double"></i> Đã nhận</span>';
                case 'failed':
                    return '<span class="status-badge failed"><i class="bx bx-x-circle"></i> Gửi thất bại</span>';
                case 'pending':
                    return '<span class="status-badge pending"><i class="bx bx-time"></i> Đang gửi</span>';
                default:
                    return '<span class="status-badge sent"><i class="bx bx-check"></i> Đã gửi</span>';
            }
        }
        
        // Fallback cho trường hợp không xác định được type
        return '<span class="status-badge unknown"><i class="bx bx-help-circle"></i> Không xác định</span>';
    }


    renderMessageDetail(message) {
        const timeFormatted = this.formatDateTime(message.timestamp);
        const displayPhone = message.phone.startsWith('+84') 
            ? '0' + message.phone.substring(3) + ' (' + message.phone + ')'
            : message.phone;
        
        return `
            <div class="message-detail-grid">
                <div class="detail-section">
                    <h4>
                        <i class='bx bx-message-detail'></i>
                        Nội dung tin nhắn
                    </h4>
                    <div class="message-content-full">${message.content}</div>
                </div>
                <div class="detail-section">
                    <h4>
                        <i class='bx bx-info-circle'></i>
                        Thông tin tin nhắn
                    </h4>
                    <div class="detail-row">
                        <span class="detail-label">ID:</span>
                        <span class="detail-value">${message.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Số điện thoại:</span>
                        <span class="detail-value">${displayPhone}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Loại:</span>
                        <span class="detail-value">
                            <span class="message-type ${message.type}">
                                <i class='bx ${message.type === 'received' ? 'bx-down-arrow-alt' : 'bx-up-arrow-alt'}'></i>
                                ${message.type === 'received' ? 'Tin nhắn đến' : 'Tin nhắn gửi'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Thời gian:</span>
                        <span class="detail-value">${timeFormatted}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Trạng thái:</span>
                        <span class="detail-value">${this.renderMessageStatus(message)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Lưu trữ:</span>
                        <span class="detail-value">
                            <span class="storage-badge ${message.storage}">
                                ${message.storage ? message.storage.toUpperCase() : 'N/A'}
                            </span>
                        </span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Độ dài:</span>
                        <span class="detail-value">${message.content.length} ký tự</span>
                    </div>
                </div>
                
                <div class="detail-actions">
                    ${message.type === 'received' ? `
                        <button class="btn btn-primary" onclick="smsManager.replyToMessage('${message.id}')">
                            <i class='bx bx-reply'></i>
                            Trả lời
                        </button>
                    ` : ''}
                    ${!message.read ? `
                        <button class="btn btn-success" onclick="smsManager.markAsRead('${message.id}')">
                            <i class='bx bx-check'></i>
                            Đánh dấu đã đọc
                        </button>
                    ` : ''}
                    <button class="btn btn-danger" onclick="smsManager.deleteMessage('${message.id}')">
                        <i class='bx bx-trash'></i>
                        Xóa tin nhắn
                    </button>
                </div>
            </div>
        `;
    }



    renderPagination() {
        const container = document.getElementById('pagination');
        const totalPages = Math.ceil(this.filteredMessages.length / this.itemsPerPage);
        
        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let paginationHTML = '';

        // Previous button
        paginationHTML += `
            <button class="pagination-btn" ${this.currentPage === 1 ? 'disabled' : ''} 
                    onclick="smsManager.goToPage(${this.currentPage - 1})">
                <i class='bx bx-chevron-left'></i>
            </button>
        `;

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        if (startPage > 1) {
            paginationHTML += `<button class="pagination-btn" onclick="smsManager.goToPage(1)">1</button>`;
            if (startPage > 2) {
                paginationHTML += `<span class="pagination-dots">...</span>`;
            }
        }

        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `
                <button class="pagination-btn ${i === this.currentPage ? 'active' : ''}" 
                        onclick="smsManager.goToPage(${i})">${i}</button>
            `;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                paginationHTML += `<span class="pagination-dots">...</span>`;
            }
            paginationHTML += `<button class="pagination-btn" onclick="smsManager.goToPage(${totalPages})">${totalPages}</button>`;
        }

        // Next button
        paginationHTML += `
            <button class="pagination-btn" ${this.currentPage === totalPages ? 'disabled' : ''} 
                    onclick="smsManager.goToPage(${this.currentPage + 1})">
                <i class='bx bx-chevron-right'></i>
            </button>
        `;

        // Page info
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredMessages.length);
        
        container.innerHTML = `
            ${paginationHTML}
            <div class="pagination-info">
                Hiển thị ${startItem}-${endItem} trong tổng số ${this.filteredMessages.length} tin nhắn
            </div>
        `;
    }

    // Message Event Bindings
    bindMessageEvents() {
        // Click events are handled via onclick attributes in the HTML
        // This method can be used for additional event bindings if needed
    }

    bindMessageDetailEvents(message) {
        // Events for message detail modal are bound via onclick in the rendered HTML
    }

    // Bulk Operations
    toggleMessageSelection(messageId) {
        if (this.selectedMessages.has(messageId)) {
            this.selectedMessages.delete(messageId);
        } else {
            this.selectedMessages.add(messageId);
        }
        
        this.updateBulkActionsVisibility();
        this.updateSelectedCount();
        this.updateMessageItemSelection(messageId);
    }

    toggleSelectAll() {
        const pageMessages = this.getPageMessages();
        const allSelected = pageMessages.every(m => this.selectedMessages.has(m.id));
        
        if (allSelected) {
            // Deselect all on current page
            pageMessages.forEach(m => this.selectedMessages.delete(m.id));
        } else {
            // Select all on current page
            pageMessages.forEach(m => this.selectedMessages.add(m.id));
        }
        
        this.renderMessages();
        this.updateBulkActionsVisibility();
        this.updateSelectedCount();
    }

    async markSelectedAsRead() {
        if (this.selectedMessages.size === 0) {
            this.showToast('warning', 'Không có tin nhắn nào được chọn', 'Vui lòng chọn ít nhất một tin nhắn');
            return;
        }
    
        const selectedIds = Array.from(this.selectedMessages);
        const totalCount = selectedIds.length;
        let successCount = 0;
    
        // Show progress
        this.showToast('info', 'Đang xử lý...', `Đang cập nhật ${totalCount} tin nhắn`);
    
        // Update each message
        for (const messageId of selectedIds) {
            try {
                const success = await this.updateReadStatusOnServer(messageId, true);
                if (success) {
                    // Update local state
                    const message = this.messages.find(m => m.id === messageId);
                    if (message) {
                        message.read = true;
                        successCount++;
                    }
                }
            } catch (error) {
                console.error('Error updating message:', messageId, error);
            }
        }
    
        // Clear selections and update UI
        this.selectedMessages.clear();
        this.applyFilters();
        this.updateStats();
        this.renderMessages();
        
        // Show result
        if (successCount === totalCount) {
            this.showToast('success', 'Thành công', `Đã đánh dấu ${successCount} tin nhắn là đã đọc`);
        } else {
            this.showToast('warning', 'Một phần thành công', `Đã cập nhật ${successCount}/${totalCount} tin nhắn`);
        }
    }


    async deleteSelectedMessages() {
        if (this.selectedMessages.size === 0) {
            this.showToast('warning', 'Không có tin nhắn nào được chọn');
            return;
        }
    
        if (this.bulkDeleting) return;
        
        const selectedIds = Array.from(this.selectedMessages);
        const confirmed = confirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} tin nhắn?`);
        
        if (!confirmed) return;
    
        this.bulkDeleting = true;
    
        try {
            // Chia nhỏ thành batch để tránh URL quá dài
            const batchSize = 10;
            const batches = [];
            
            for (let i = 0; i < selectedIds.length; i += batchSize) {
                batches.push(selectedIds.slice(i, i + batchSize));
            }
    
            let totalDeleted = 0;
            let totalFailed = 0;
    
            this.showToast('info', 'Đang xóa...', `Xử lý ${batches.length} nhóm tin nhắn`);
    
            // Xử lý từng batch
            for (let i = 0; i < batches.length; i++) {
                const batch = batches[i];
                const idsParam = batch.join(',');
                const url = `${window.location.origin}/cgi-bin/sms-delete?ids=${encodeURIComponent(idsParam)}`;
                
                console.log(`Processing batch ${i+1}/${batches.length}:`, batch);
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json,*/*' }
                });
    
                if (response.ok) {
                    const result = await response.json();
                    totalDeleted += result.deleted_count || 0;
                    totalFailed += result.failed_count || 0;
    
                    // Remove successfully deleted messages from local array
                    if (result.deleted && result.deleted.length > 0) {
                        const deletedIds = result.deleted.map(id => id.toString());
                        this.messages = this.messages.filter(m => 
                            !deletedIds.includes(m.id.toString())
                        );
                    }
                } else {
                    totalFailed += batch.length;
                }
    
                // Small delay between batches
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
    
            // Update UI
            this.selectedMessages.clear();
            this.applyFilters();
            this.updateStats();
            this.renderMessages();
    
            // Show result
            if (totalFailed === 0) {
                this.showToast('success', 'Xóa thành công', `Đã xóa ${totalDeleted} tin nhắn`);
            } else {
                this.showToast('warning', 'Xóa một phần', `Đã xóa ${totalDeleted}/${totalDeleted + totalFailed} tin nhắn`);
            }
    
        } catch (error) {
            console.error('Bulk delete error:', error);
            this.showToast('error', 'Lỗi xóa', error.message);
        } finally {
            this.bulkDeleting = false;
        }
    }

    
    showBulkProgress(current, total, operation = 'Đang xử lý') {
        const percentage = Math.round((current / total) * 100);
        const existingToast = document.querySelector('.toast.bulk-progress');
        
        if (existingToast) {
            const progressBar = existingToast.querySelector('.progress-bar');
            const progressText = existingToast.querySelector('.progress-text');
            
            if (progressBar) progressBar.style.width = `${percentage}%`;
            if (progressText) progressText.textContent = `${operation} ${current}/${total} (${percentage}%)`;
        } else {
            // Create new progress toast
            this.showProgressToast(operation, current, total);
        }
    }


    async deleteBatchWithRetry(batch, maxRetries = 2) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const idsParam = batch.join(',');
                const url = `${window.location.origin}/cgi-bin/sms-delete?ids=${encodeURIComponent(idsParam)}`;
                
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json,*/*' },
                    timeout: 10000 // 10 second timeout
                });
    
                if (response.ok) {
                    return await response.json();
                } else if (response.status >= 500 && attempt < maxRetries) {
                    // Retry on server errors
                    console.log(`Batch failed, retrying... (${attempt}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                } else {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
            } catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                console.log(`Attempt ${attempt} failed, retrying...`, error);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
    
    // Kiểm tra độ dài URL để tránh 414 error
    buildDeleteUrl(ids) {
        const baseUrl = `${window.location.origin}/cgi-bin/sms-delete?ids=`;
        const idsParam = ids.join(',');
        const fullUrl = baseUrl + encodeURIComponent(idsParam);
        
        // Check URL length limit (typically 2048 characters)
        if (fullUrl.length > 2000) {
            throw new Error('Too many IDs for single request. Will process in batches.');
        }
        
        return fullUrl;
    }

    
    // Thêm debug vào method updateReadStatusOnServer
    async updateReadStatusOnServer(messageId, readStatus) {
        try {
            const baseUrl = window.location.origin;
            const url = `${baseUrl}/cgi-bin/sms-mark-read?id=${encodeURIComponent(messageId)}&read=${readStatus ? 1 : 0}`;
            
            console.log('=== UPDATING READ STATUS ===');
            console.log('URL:', url);
            console.log('Message ID:', messageId);
            console.log('Read Status:', readStatus);
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                    'Cache-Control': 'no-cache'
                }
            });
    
            console.log('Response status:', response.status);
            console.log('Response OK:', response.ok);
            
            if (response.ok) {
                const responseText = await response.text();
                console.log('Response text:', responseText);
                return true;
            } else {
                console.error('Server error:', response.status, response.statusText);
                return false;
            }
        } catch (error) {
            console.error('Network error:', error);
            return false;
        }
    }



    // Message Actions
    replyToMessage(messageId) {
        const message = this.messages.find(m => m.id === messageId);
        if (!message) return;

        this.closeModals();
        this.openNewMessageModal();
        
        // Pre-fill phone number
        document.getElementById('recipientPhone').value = message.phone;
        document.getElementById('messageContent').focus();
    }

    async markAsRead(messageId) {
        try {
            console.log('Marking message as read:', messageId);
            
            // Gọi backend để cập nhật trạng thái
            const success = await this.updateReadStatusOnServer(messageId, true);
            
            if (success) {
                // Cập nhật local state
                const message = this.messages.find(m => m.id === messageId);
                if (message) {
                    message.read = true;
                    this.applyFilters();
                    this.updateStats();
                    this.renderMessages();
                    this.closeModals();
                    this.showToast('success', 'Đã cập nhật', 'Tin nhắn đã được đánh dấu là đã đọc');
                }
            } else {
                this.showToast('error', 'Lỗi', 'Không thể cập nhật trạng thái đọc');
            }
        } catch (error) {
            console.error('Error marking as read:', error);
            this.showToast('error', 'Lỗi', 'Có lỗi xảy ra khi cập nhật trạng thái');
        }
    }

    // Navigation
    goToPage(page) {
        const totalPages = Math.ceil(this.filteredMessages.length / this.itemsPerPage);
        if (page >= 1 && page <= totalPages) {
            this.currentPage = page;
            this.renderMessages();
        }
    }

    // Utility Functions
    updateStats() {
        const total = this.messages.length;
        const sent = this.messages.filter(m => m.type === 'sent').length;
        const received = this.messages.filter(m => m.type === 'received').length;
        const unread = this.messages.filter(m => !m.read).length;

        document.getElementById('totalMessages').textContent = total;
        document.getElementById('sentMessages').textContent = sent;
        document.getElementById('receivedMessages').textContent = received;
        document.getElementById('unreadMessages').textContent = unread;
    }

    updateBulkActionsVisibility() {
        const bulkActions = document.getElementById('bulkActions');
        const hasSelection = this.selectedMessages.size > 0;
        
        bulkActions.style.display = hasSelection ? 'flex' : 'none';
        this.updateSelectedCount();
    }

    updateSelectedCount() {
        document.getElementById('selectedCount').textContent = `${this.selectedMessages.size} đã chọn`;
    }

    updateMessageItemSelection(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement) {
            const isSelected = this.selectedMessages.has(messageId);
            messageElement.classList.toggle('selected', isSelected);
            
            const checkbox = messageElement.querySelector('input[type="checkbox"]');
            checkbox.checked = isSelected;
        }
    }

    getPageMessages() {
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        return this.filteredMessages.slice(startIndex, endIndex);
    }

    setLoading(loading) {
        this.isLoading = loading;
        
        if (loading) {
            document.getElementById('messagesLoading').style.display = 'flex';
            document.getElementById('messagesList').style.display = 'none';
            document.getElementById('messagesEmpty').style.display = 'none';
        }
    }

    // Method loadMessages không hiển thị toast
    async loadMessagesQuiet() {
        this.setLoading(true);
        
        try {
            const response = await this.fetchMessages();
            
            if (response && response.length > 0) {
                this.messages = response;
                this.filteredMessages = [...this.messages];
            } else {
                this.messages = this.generateMockData();
                this.filteredMessages = [...this.messages];
            }
            
        } catch (error) {
            console.error('Error loading messages:', error);
            this.messages = this.generateMockData();
            this.filteredMessages = [...this.messages];
            throw error;
        } finally {
            this.setLoading(false);
        }
    }
    
    // Method refreshMessages sử dụng loadMessagesQuiet
    async refreshMessages() {
        // Prevent multiple calls
        if (this.refreshing) {
            console.log('Already refreshing, skipping...');
            return;
        }
        
        this.refreshing = true;
        console.log('=== REFRESH START ===');
        
        try {
            this.showToast('info', 'Đang làm mới...', 'Tải lại danh sách tin nhắn');
            this.selectedMessages.clear();
            
            // Load messages without showing toast
            await this.loadMessagesQuiet();
            
            this.updateStats();
            this.renderMessages();
            
            this.showToast('success', 'Làm mới thành công', `Hiển thị ${this.messages.length} tin nhắn`);
            
        } catch (error) {
            console.error('Refresh error:', error);
            this.showToast('error', 'Lỗi làm mới', 'Có lỗi xảy ra khi tải dữ liệu');
        } finally {
            this.refreshing = false;
            console.log('=== REFRESH END ===');
        }
    }

    
    // Method để sync với server khi có tin nhắn mới
    async syncWithServer() {
        try {
            const response = await this.fetchMessages();
            if (response && response.length > this.messages.length) {
                const newMessages = response.slice(0, response.length - this.messages.length);
                this.showToast('info', 'Tin nhắn mới!', `Có ${newMessages.length} tin nhắn mới`);
                this.messages = response;
                this.applyFilters();
                this.updateStats();
                this.renderMessages();
            }
        } catch (error) {
            console.log('Auto sync failed:', error);
        }
    }

    // Auto sync mỗi 30 giây (tùy chọn)
    startAutoSync() {
        setInterval(() => {
            this.syncWithServer();
        }, 2000); // 30 seconds
    }

    resetNewMessageForm() {
        document.getElementById('newMessageForm').reset();
        document.getElementById('charCount').textContent = '0';
    }

    updateCharCount() {
        const textarea = document.getElementById('messageContent');
        const count = textarea.value.length;
        const counter = document.getElementById('charCount');
        
        counter.textContent = count;
        
        if (count > 160) {
            counter.style.color = 'var(--danger-color)';
        } else if (count > 140) {
            counter.style.color = 'var(--warning-color)';
        } else {
            counter.style.color = 'var(--gray-500)';
        }
    }

    validatePhone(phone) {
        // Loại bỏ khoảng trắng và ký tự đặc biệt không cần thiết
        const cleanPhone = phone.replace(/[\s\-\(\)\+]/g, '');
        
        // Kiểm tra cơ bản: phải có ít nhất 1 chữ số và không chứa ký tự đặc biệt
        const basicRegex = /^[0-9]+$/;
        
        // Độ dài từ 3-15 số (đủ cho mọi loại số trên thế giới)
        const lengthValid = cleanPhone.length >= 3 && cleanPhone.length <= 15;
        
        return basicRegex.test(cleanPhone) && lengthValid;
    }


    truncateText(text, maxLength) {
        if (text.length <= maxLength) return text;
        return text.substr(0, maxLength) + '...';
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Vừa xong';
        if (minutes < 60) return `${minutes} phút trước`;
        if (hours < 24) return `${hours} giờ trước`;
        if (days < 7) return `${days} ngày trước`;
        
        return this.formatDate(timestamp);
    }

    formatDate(date) {
        return date.toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    formatDateTime(date) {
        return date.toLocaleString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Export Functions
    async exportMessages() {
        // Prevent multiple calls
        if (this.exporting) {
            console.log('Already exporting, skipping...');
            return;
        }
        
        this.exporting = true;
        console.log('=== EXPORT START ===');
        
        try {
            const messages = this.filteredMessages.length > 0 ? this.filteredMessages : this.messages;
            
            if (messages.length === 0) {
                this.showToast('warning', 'Không có dữ liệu', 'Không có tin nhắn nào để xuất');
                return;
            }
    
            // Disable export button during processing
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.disabled = true;
                exportBtn.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Đang xuất...';
            }
    
            this.showToast('info', 'Đang xuất dữ liệu...', `Chuẩn bị xuất ${messages.length} tin nhắn`);
    
            // Generate CSV content
            const csvContent = this.generateCSV(messages);
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            
            // Create download link
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `sms-export-${timestamp}.csv`;
            
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up URL object
            URL.revokeObjectURL(url);
            
            this.showToast('success', 'Xuất thành công', `Đã xuất ${messages.length} tin nhắn ra file ${filename}`);
            
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('error', 'Lỗi xuất dữ liệu', error.message || 'Có lỗi xảy ra khi xuất file');
        } finally {
            this.exporting = false;
            
            // Re-enable export button
            const exportBtn = document.getElementById('exportBtn');
            if (exportBtn) {
                exportBtn.disabled = false;
                exportBtn.innerHTML = '<i class="bx bx-download"></i> Xuất dữ liệu';
            }
            
            console.log('=== EXPORT END ===');
        }
    }


    generateCSV(messages) {
        const headers = ['Số điện thoại', 'Nội dung', 'Loại', 'Thời gian', 'Trạng thái đọc', 'Trạng thái gửi'];
        const csvRows = [headers.join(',')];
        
        messages.forEach(message => {
            const row = [
                message.phone,
                `"${message.content.replace(/"/g, '""')}"`, // Escape quotes
                message.type === 'received' ? 'Nhận' : 'Gửi',
                this.formatDateTime(message.timestamp),
                message.read ? 'Đã đọc' : 'Chưa đọc',
                message.status || 'N/A'
            ];
            csvRows.push(row.join(','));
        });
        
        return '\ufeff' + csvRows.join('\n'); // UTF-8 BOM for Excel compatibility
    }

    bulkDeleteMessages() {
        if (this.selectedMessages.size === 0) {
            this.showToast('info', 'Chọn tin nhắn để xóa', 'Vui lòng chọn ít nhất một tin nhắn');
            return;
        }
        
        this.deleteSelectedMessages();
    }

    // Toast Notifications
    showToast(type, title, message) {
        const toast = this.createToast(type, title, message);
        const container = document.getElementById('toastContainer');
        
        container.appendChild(toast);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.remove();
            }
        }, 4000);
    }

    createToast(type, title, message) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        const iconMap = {
            success: 'bx-check-circle',
            error: 'bx-error-circle',
            warning: 'bx-error',
            info: 'bx-info-circle'
        };
        
        toast.innerHTML = `
            <div class="toast-icon">
                <i class='bx ${iconMap[type]}'></i>
            </div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentNode.remove()">
                <i class='bx bx-x'></i>
            </button>
        `;
        
        return toast;
    }

    showWelcomeToast() {
        setTimeout(() => {
            this.showToast('info', 'Chào mừng!', 'Hệ thống SMS Manager Pro đã sẵn sàng');
        }, 1000);
    }
}

// Initialize the SMS Manager when DOM is loaded
// Khởi tạo với auto sync
document.addEventListener('DOMContentLoaded', () => {
    window.smsManager = new SMSManager();
    
    // Bật auto sync sau 1 phút
    setTimeout(() => {
        window.smsManager.startAutoSync();
    }, 2000);
});

// Add some additional CSS for status badges
const additionalCSS = `
.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
}

.status-badge.unread {
    background: var(--primary-light);
    color: var(--primary-color);
}

.status-badge.sent {
    background: var(--info-light);
    color: var(--info-color);
}

.status-badge.delivered {
    background: var(--success-light);
    color: var(--success-color);
}

.status-badge.failed {
    background: var(--danger-light);
    color: var(--danger-color);
}

.status-badge.pending {
    background: var(--warning-light);
    color: var(--warning-color);
}

.pagination-dots {
    display: flex;
    align-items: center;
    padding: 0 8px;
    color: var(--gray-400);
}
`;

// Inject additional CSS
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);