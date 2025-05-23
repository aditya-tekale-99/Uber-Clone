// src/services/driverService.js
import api from './api';

export const driverService = {
  // Get driver profile
  getProfile: async (driverId) => {
    const response = await api.get(`/drivers/${driverId}`);
    return response.data;
  },
  
  // Update driver profile
  updateProfile: async (driverId, data) => {
    const response = await api.put(`/drivers/${driverId}`, data);
    return response.data;
  },
  
  // Update driver status (available, busy, offline)
  updateStatus: async (driverId, status, coordinates = null) => {
    console.log(`Sending status update request: ${driverId}, ${status}`, coordinates);
    const data = { status };
    
    // Add coordinates if available
    if (coordinates) {
      data.latitude = coordinates.latitude;
      data.longitude = coordinates.longitude;
    }

      console.log('Request data:', data);

    
    const response = await api.patch(`/drivers/${driverId}/status`, data);
    return response.data;
  },
  
  // Get available ride requests
  getAvailableRides: async (latitude, longitude) => {
    const response = await api.get(`/rides/nearby?latitude=${latitude}&longitude=${longitude}`);
    return response.data;
  },
 
  
  // Accept a ride
  acceptRide: async (rideId) => {
    console.log('Calling acceptRide API for ride:', rideId);
    const response = await api.patch(`/rides/${rideId}/accept`);
    return response.data;
  },

  // Get active ride
  // Update in driverService.js
getActiveRide: async (driverId) => {
  try {
    console.log('Calling getActiveRide API for driver:', driverId);
    const response = await api.get(`/rides/driver/${driverId}/active`);
    console.log('getActiveRide API response:', response);
    
    // Check if the response contains the data property correctly
    if (response.data && response.data.data) {
      return response.data;
    }
    
    // If response structure is different, format it accordingly
    if (response.data) {
      return { data: response.data };
    }
    
    return { data: null };
  } catch (error) {
    console.error('Error fetching active ride:', error);
    // If it's a 404, it means no active ride, so return null data
    if (error.response?.status === 404) {
      return { data: null };
    }
    // Rethrow for other errors
    throw error;
  }
},
  
  // Start ride (after picking up passenger)
  startRide: async (rideId) => {
    const response = await api.patch(`/rides/${rideId}/start`);
    return response.data;
  },
  
  // Complete ride
  completeRide: async (rideId) => {
  try {
    console.log(`Calling completeRide API for ride: ${rideId}`);
    const response = await api.patch(`/rides/${rideId}/complete`);
    console.log('completeRide API response:', response);
    return response.data;
  } catch (error) {
    console.error('Error in completeRide service call:', error);
    throw error; // Re-throw to be handled by the component
  }
},

  // Address update
  updateAddress: async (driverId, addressData) => {
    const response = await api.patch(`/drivers/${driverId}/address`, addressData);
    return response.data;
  },
  
getRideHistory: async (driverId) => {
  console.log('Calling getRideHistory API for driver:', driverId);
  const response = await api.get(`/rides/driver/${driverId}`);
  console.log('getRideHistory API response:', response);
  
  return response.data && response.data.data 
    ? { data: response.data.data }  
    : response.data;  
},
  
  // Get driver's earnings
getEarnings: async (driverId, period = 'all') => {
  console.log('Calling getEarnings API for driver:', driverId);
  const response = await api.get(`/billing/driver/${driverId}?period=${period}`);
  console.log('getEarnings API response:', response);
  
  // Transform the data into the expected format
  const billings = response.data && response.data.data ? response.data.data : [];
  
  // Process the array into earnings periods
  const earnings = {
    today: { totalEarnings: 0, totalRides: 0, rides: [] },
    week: { totalEarnings: 0, totalRides: 0, rides: [] },
    month: { totalEarnings: 0, totalRides: 0, rides: [] },
    year: { totalEarnings: 0, totalRides: 0, rides: [] },
    all: { totalEarnings: 0, totalRides: 0, rides: [...billings] }
  };
  
  // Calculate totals
  if (billings.length > 0) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    
    // Calculate total earnings
    earnings.all.totalEarnings = billings.reduce((sum, bill) => sum + (bill.total_amount || 0), 0);
    earnings.all.totalRides = billings.length;
    
    // Filter for each period
    billings.forEach(bill => {
      const billDate = new Date(bill.date);
      const amount = bill.total_amount || 0;
      
      // Today
      if (billDate >= today) {
        earnings.today.rides.push(bill);
        earnings.today.totalEarnings += amount;
        earnings.today.totalRides++;
      }
      
      // This week
      if (billDate >= weekStart) {
        earnings.week.rides.push(bill);
        earnings.week.totalEarnings += amount;
        earnings.week.totalRides++;
      }
      
      // This month
      if (billDate >= monthStart) {
        earnings.month.rides.push(bill);
        earnings.month.totalEarnings += amount;
        earnings.month.totalRides++;
      }
      
      // This year
      if (billDate >= yearStart) {
        earnings.year.rides.push(bill);
        earnings.year.totalEarnings += amount;
        earnings.year.totalRides++;
      }
    });
  }
  
  return { data: earnings };
},
  
  // Rate a customer after ride
  rateCustomer: async (rideId, rating, comment) => {
    const response = await api.post(`/rides/${rideId}/rate-customer`, { rating, comment });
    return response.data;
  },

  cancelRide: async (rideId, reason = '') => {
  const response = await api.patch(`/rides/${rideId}/cancel-driver`, { reason });
  return response.data;
},
  
  // Upload driver profile photo or vehicle images
  uploadMedia: async (driverId, formData) => {
  try {
    console.log('Uploading media for driver:', driverId);
    const response = await api.post(`/drivers/${driverId}/media`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    console.log('Upload response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error uploading media:', error);
    console.error('Error response:', error.response?.data);
    throw error;
  }
},

  deleteProfile: async (driverId) => {
  try {
    console.log(`Attempting to delete driver profile: ${driverId}`);
    const response = await api.delete(`/drivers/delete/${driverId}`);
    console.log('Driver deletion response:', response);
    return response.data;
  } catch (error) {
    console.error('Driver deletion error:', error);
    console.error('Error response:', error.response?.data);
    throw error;
  }
}
};