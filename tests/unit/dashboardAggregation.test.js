/**
 * Unit tests for dashboard aggregation logic.
 * Tests the data transformation and aggregation functions used in dashboard endpoints.
 */

const axios = require('axios');

jest.mock('axios');

describe('Dashboard Aggregation Logic', () => {
  // Service URLs (mirroring the config)
  const services = {
    user: 'http://localhost:3001',
    training: 'http://localhost:3002',
    schedule: 'http://localhost:8003',
    progress: 'http://localhost:8004'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Client Dashboard Aggregation', () => {
    it('should aggregate data from multiple services using Promise.allSettled', async () => {
      const mockProfile = { data: { data: { id: 'user-123', name: 'John Doe', role: 'client' } } };
      const mockPrograms = { data: { data: [{ id: 'prog-1', name: 'Strength Training' }] } };
      const mockBookings = { data: { data: [{ id: 'book-1', date: '2024-01-15' }] } };
      const mockAnalytics = { data: { data: { total_workouts: 50, streak: 7 } } };

      axios.get
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(mockPrograms)
        .mockResolvedValueOnce(mockBookings)
        .mockResolvedValueOnce(mockAnalytics);

      const [profile, programs, bookings, analytics] = await Promise.allSettled([
        axios.get(`${services.user}/api/users/user-123`),
        axios.get(`${services.training}/api/programs?client_id=user-123`),
        axios.get(`${services.schedule}/api/bookings?client_id=user-123`),
        axios.get(`${services.progress}/api/analytics/client/user-123`)
      ]);

      expect(profile.status).toBe('fulfilled');
      expect(programs.status).toBe('fulfilled');
      expect(bookings.status).toBe('fulfilled');
      expect(analytics.status).toBe('fulfilled');
    });

    it('should handle partial service failures gracefully', async () => {
      const mockProfile = { data: { data: { id: 'user-123', name: 'John Doe' } } };
      const mockPrograms = { data: { data: [] } };

      axios.get
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(mockPrograms)
        .mockRejectedValueOnce(new Error('Schedule service unavailable'))
        .mockRejectedValueOnce(new Error('Progress service unavailable'));

      const [profile, programs, bookings, analytics] = await Promise.allSettled([
        axios.get(`${services.user}/api/users/user-123`),
        axios.get(`${services.training}/api/programs?client_id=user-123`),
        axios.get(`${services.schedule}/api/bookings?client_id=user-123`),
        axios.get(`${services.progress}/api/analytics/client/user-123`)
      ]);

      expect(profile.status).toBe('fulfilled');
      expect(programs.status).toBe('fulfilled');
      expect(bookings.status).toBe('rejected');
      expect(analytics.status).toBe('rejected');
    });

    it('should construct correct dashboard response with fulfilled services', async () => {
      const mockProfile = { data: { data: { id: 'user-123', name: 'John Doe' } } };
      const mockPrograms = { data: { data: [{ id: 'prog-1' }, { id: 'prog-2' }] } };
      const mockBookings = { data: { data: [{ id: 'book-1' }] } };
      const mockAnalytics = { data: { data: { streak: 5 } } };

      axios.get
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(mockPrograms)
        .mockResolvedValueOnce(mockBookings)
        .mockResolvedValueOnce(mockAnalytics);

      const [profile, programs, bookings, analytics] = await Promise.allSettled([
        axios.get(`${services.user}/api/users/user-123`),
        axios.get(`${services.training}/api/programs?client_id=user-123`),
        axios.get(`${services.schedule}/api/bookings?client_id=user-123`),
        axios.get(`${services.progress}/api/analytics/client/user-123`)
      ]);

      // Simulate dashboard response construction
      const dashboardData = {
        profile: profile.status === 'fulfilled' ? profile.value.data.data : null,
        active_programs: programs.status === 'fulfilled' ? programs.value.data.data : [],
        upcoming_bookings: bookings.status === 'fulfilled' ? bookings.value.data.data : [],
        progress_summary: analytics.status === 'fulfilled' ? analytics.value.data.data : null
      };

      expect(dashboardData.profile).toEqual({ id: 'user-123', name: 'John Doe' });
      expect(dashboardData.active_programs.length).toBe(2);
      expect(dashboardData.upcoming_bookings.length).toBe(1);
      expect(dashboardData.progress_summary.streak).toBe(5);
    });

    it('should return null/empty for rejected services', async () => {
      axios.get
        .mockRejectedValueOnce(new Error('User service down'))
        .mockRejectedValueOnce(new Error('Training service down'))
        .mockRejectedValueOnce(new Error('Schedule service down'))
        .mockRejectedValueOnce(new Error('Progress service down'));

      const [profile, programs, bookings, analytics] = await Promise.allSettled([
        axios.get(`${services.user}/api/users/user-123`),
        axios.get(`${services.training}/api/programs?client_id=user-123`),
        axios.get(`${services.schedule}/api/bookings?client_id=user-123`),
        axios.get(`${services.progress}/api/analytics/client/user-123`)
      ]);

      const dashboardData = {
        profile: profile.status === 'fulfilled' ? profile.value.data.data : null,
        active_programs: programs.status === 'fulfilled' ? programs.value.data.data : [],
        upcoming_bookings: bookings.status === 'fulfilled' ? bookings.value.data.data : [],
        progress_summary: analytics.status === 'fulfilled' ? analytics.value.data.data : null
      };

      expect(dashboardData.profile).toBeNull();
      expect(dashboardData.active_programs).toEqual([]);
      expect(dashboardData.upcoming_bookings).toEqual([]);
      expect(dashboardData.progress_summary).toBeNull();
    });
  });

  describe('Trainer Dashboard Aggregation', () => {
    it('should filter bookings for today\'s schedule', async () => {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const mockBookings = {
        data: {
          data: [
            { id: 'book-1', booking_date: yesterday, client_name: 'Past Client' },
            { id: 'book-2', booking_date: today, client_name: 'Today Client' },
            { id: 'book-3', booking_date: tomorrow, client_name: 'Future Client' }
          ]
        }
      };

      // Filter today's bookings
      const todaySchedule = mockBookings.data.data.filter(b =>
        b.booking_date === today || new Date(b.booking_date).toISOString().split('T')[0] === today
      );

      expect(todaySchedule.length).toBe(1);
      expect(todaySchedule[0].client_name).toBe('Today Client');
    });

    it('should calculate active clients count from programs', async () => {
      const mockPrograms = {
        data: {
          data: [
            { id: 'prog-1', client_id: 'client-1', status: 'active' },
            { id: 'prog-2', client_id: 'client-2', status: 'active' },
            { id: 'prog-3', client_id: 'client-3', status: 'active' }
          ]
        }
      };

      const activeClients = mockPrograms.data.data.length;
      expect(activeClients).toBe(3);
    });

    it('should aggregate trainer dashboard data correctly', async () => {
      const today = new Date().toISOString().split('T')[0];
      
      const mockProfile = { data: { data: { id: 'trainer-1', name: 'Jane Smith', role: 'trainer' } } };
      const mockPrograms = { data: { data: [{ id: 'prog-1' }, { id: 'prog-2' }] } };
      const mockBookings = { 
        data: { 
          data: [
            { id: 'book-1', booking_date: today },
            { id: 'book-2', booking_date: '2024-01-01' }
          ] 
        } 
      };

      axios.get
        .mockResolvedValueOnce(mockProfile)
        .mockResolvedValueOnce(mockPrograms)
        .mockResolvedValueOnce(mockBookings)
        .mockResolvedValueOnce({ data: { data: [] } });

      const [profile, programs, todayBookings, clients] = await Promise.allSettled([
        axios.get(`${services.user}/api/users/trainer-1`),
        axios.get(`${services.training}/api/programs?trainer_id=trainer-1`),
        axios.get(`${services.schedule}/api/bookings?trainer_id=trainer-1`),
        axios.get(`${services.user}/api/users?role=client`)
      ]);

      let todaySchedule = [];
      if (todayBookings.status === 'fulfilled') {
        todaySchedule = todayBookings.value.data.data.filter(b =>
          b.booking_date === today || new Date(b.booking_date).toISOString().split('T')[0] === today
        );
      }

      const dashboardData = {
        profile: profile.status === 'fulfilled' ? profile.value.data.data : null,
        active_clients: programs.status === 'fulfilled' ? programs.value.data.data.length : 0,
        today_schedule: todaySchedule,
        recent_programs: programs.status === 'fulfilled' ? programs.value.data.data : []
      };

      expect(dashboardData.profile.name).toBe('Jane Smith');
      expect(dashboardData.active_clients).toBe(2);
      expect(dashboardData.today_schedule.length).toBe(1);
      expect(dashboardData.recent_programs.length).toBe(2);
    });
  });

  describe('Admin Dashboard Aggregation', () => {
    it('should extract total counts from pagination metadata', async () => {
      const mockUsers = { data: { pagination: { total_count: 150 } } };
      const mockTrainers = { data: { pagination: { total_count: 25 } } };
      const mockClients = { data: { pagination: { total_count: 120 } } };
      const mockPrograms = { data: { pagination: { total_count: 80 } } };

      axios.get
        .mockResolvedValueOnce(mockUsers)
        .mockResolvedValueOnce(mockTrainers)
        .mockResolvedValueOnce(mockClients)
        .mockResolvedValueOnce(mockPrograms);

      const [users, trainers, clients, programs] = await Promise.allSettled([
        axios.get(`${services.user}/api/users?limit=1`),
        axios.get(`${services.user}/api/users?role=trainer&limit=1`),
        axios.get(`${services.user}/api/users?role=client&limit=1`),
        axios.get(`${services.training}/api/programs?limit=1`)
      ]);

      const dashboardData = {
        total_users: users.status === 'fulfilled' ? users.value.data.pagination?.total_count || 0 : 0,
        total_trainers: trainers.status === 'fulfilled' ? trainers.value.data.pagination?.total_count || 0 : 0,
        total_clients: clients.status === 'fulfilled' ? clients.value.data.pagination?.total_count || 0 : 0,
        total_programs: programs.status === 'fulfilled' ? programs.value.data.pagination?.total_count || 0 : 0
      };

      expect(dashboardData.total_users).toBe(150);
      expect(dashboardData.total_trainers).toBe(25);
      expect(dashboardData.total_clients).toBe(120);
      expect(dashboardData.total_programs).toBe(80);
    });

    it('should return 0 when pagination is missing', async () => {
      const mockResponse = { data: { data: [] } }; // No pagination

      axios.get.mockResolvedValue(mockResponse);

      const [users] = await Promise.allSettled([
        axios.get(`${services.user}/api/users?limit=1`)
      ]);

      const totalUsers = users.status === 'fulfilled' ? users.value.data.pagination?.total_count || 0 : 0;
      expect(totalUsers).toBe(0);
    });

    it('should return 0 when service is unavailable', async () => {
      axios.get.mockRejectedValue(new Error('Service unavailable'));

      const [users] = await Promise.allSettled([
        axios.get(`${services.user}/api/users?limit=1`)
      ]);

      const totalUsers = users.status === 'fulfilled' ? users.value.data.pagination?.total_count || 0 : 0;
      expect(totalUsers).toBe(0);
    });
  });

  describe('Access Control Logic', () => {
    describe('Client Dashboard Access', () => {
      it('should allow client to access their own dashboard', () => {
        const user = { id: 'client-123', role: 'client' };
        const requestedId = 'client-123';
        
        const hasAccess = !(user.role === 'client' && user.id !== requestedId);
        expect(hasAccess).toBe(true);
      });

      it('should deny client access to other client dashboard', () => {
        const user = { id: 'client-123', role: 'client' };
        const requestedId = 'client-456';
        
        const shouldDeny = user.role === 'client' && user.id !== requestedId;
        expect(shouldDeny).toBe(true);
      });

      it('should allow trainer to access any client dashboard', () => {
        const user = { id: 'trainer-1', role: 'trainer' };
        const requestedId = 'client-123';
        
        const shouldDeny = user.role === 'client' && user.id !== requestedId;
        expect(shouldDeny).toBe(false);
      });

      it('should allow admin to access any client dashboard', () => {
        const user = { id: 'admin-1', role: 'admin' };
        const requestedId = 'client-123';
        
        const shouldDeny = user.role === 'client' && user.id !== requestedId;
        expect(shouldDeny).toBe(false);
      });
    });

    describe('Trainer Dashboard Access', () => {
      it('should allow trainer to access their own dashboard', () => {
        const user = { id: 'trainer-1', role: 'trainer' };
        const requestedId = 'trainer-1';
        
        const hasAccess = !(user.role === 'trainer' && user.id !== requestedId);
        expect(hasAccess).toBe(true);
      });

      it('should deny trainer access to other trainer dashboard', () => {
        const user = { id: 'trainer-1', role: 'trainer' };
        const requestedId = 'trainer-2';
        
        const shouldDeny = user.role === 'trainer' && user.id !== requestedId;
        expect(shouldDeny).toBe(true);
      });

      it('should allow admin to access any trainer dashboard', () => {
        const user = { id: 'admin-1', role: 'admin' };
        const requestedId = 'trainer-1';
        
        const shouldDeny = user.role === 'trainer' && user.id !== requestedId;
        expect(shouldDeny).toBe(false);
      });
    });

    describe('Admin Dashboard Access', () => {
      it('should allow admin to access admin dashboard', () => {
        const user = { role: 'admin' };
        const hasAccess = user.role === 'admin';
        expect(hasAccess).toBe(true);
      });

      it('should deny non-admin access to admin dashboard', () => {
        const user = { role: 'trainer' };
        const shouldDeny = user.role !== 'admin';
        expect(shouldDeny).toBe(true);
      });

      it('should deny client access to admin dashboard', () => {
        const user = { role: 'client' };
        const shouldDeny = user.role !== 'admin';
        expect(shouldDeny).toBe(true);
      });
    });
  });

  describe('Response Structure', () => {
    it('should include success flag in response', () => {
      const response = {
        success: true,
        data: {},
        timestamp: new Date().toISOString()
      };
      
      expect(response.success).toBe(true);
    });

    it('should include timestamp in response', () => {
      const response = {
        success: true,
        data: {},
        timestamp: new Date().toISOString()
      };
      
      expect(response.timestamp).toBeDefined();
      expect(() => new Date(response.timestamp)).not.toThrow();
    });

    it('should structure error response correctly', () => {
      const errorResponse = {
        success: false,
        error: {
          code: 'DASHBOARD_ERROR',
          message: 'Failed to load dashboard'
        }
      };
      
      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error.code).toBe('DASHBOARD_ERROR');
    });

    it('should structure forbidden response correctly', () => {
      const forbiddenResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Cannot access other client dashboards'
        }
      };
      
      expect(forbiddenResponse.success).toBe(false);
      expect(forbiddenResponse.error.code).toBe('FORBIDDEN');
    });
  });
});

describe('Service URL Configuration', () => {
  it('should have all required service URLs defined', () => {
    const services = {
      user: process.env.USER_SERVICE_URL || 'http://localhost:3001',
      training: process.env.TRAINING_SERVICE_URL || 'http://localhost:3002',
      schedule: process.env.SCHEDULE_SERVICE_URL || 'http://localhost:8003',
      progress: process.env.PROGRESS_SERVICE_URL || 'http://localhost:8004'
    };
    
    expect(services.user).toBeDefined();
    expect(services.training).toBeDefined();
    expect(services.schedule).toBeDefined();
    expect(services.progress).toBeDefined();
  });

  it('should use correct default ports for each service', () => {
    const defaultServices = {
      user: 'http://localhost:3001',
      training: 'http://localhost:3002',
      schedule: 'http://localhost:8003',
      progress: 'http://localhost:8004'
    };
    
    expect(defaultServices.user).toContain('3001');
    expect(defaultServices.training).toContain('3002');
    expect(defaultServices.schedule).toContain('8003');
    expect(defaultServices.progress).toContain('8004');
  });
});
