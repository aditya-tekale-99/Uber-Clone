// src/pages/driver/AvailableRides.jsx
import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  TextField,
  Collapse,
  IconButton
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  DirectionsCar as CarIcon,
  MyLocation as LocationIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { driverService } from '../../services/driverService';
import MapWithMarkers from '../../components/common/MapWithMarkers';
import axios from 'axios';

function AvailableRides() {
  const { user } = useSelector(state => state.auth);
  const navigate = useNavigate();
  const [availableRides, setAvailableRides] = useState([]);
  const [selectedRide, setSelectedRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);
  const [location, setLocation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [driverStatus, setDriverStatus] = useState(user?.status || 'offline');
  
  // Address update form states
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressForm, setAddressForm] = useState({
    address: '',
    city: '',
    state: '',
    zip_code: ''
  });
  const [updatingAddress, setUpdatingAddress] = useState(false);

  // Add this useEffect to poll the driver's status
  useEffect(() => {
    // Set initial status from user object
    setDriverStatus(user?.status || 'offline');
    
    const checkDriverStatus = async () => {
      try {
        const response = await driverService.getProfile(user.driver_id);
        if (response.data && response.data.status) {
          setDriverStatus(response.data.status);
        }
      } catch (err) {
        console.error('Error fetching driver status:', err);
      }
    };
    
    // Check initially
    checkDriverStatus();
    
    // Set up polling every 10 seconds
    const statusInterval = setInterval(checkDriverStatus, 10000);
    
    // Clean up
    return () => clearInterval(statusInterval);
  }, [user]);

  useEffect(() => {
    // Get current location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          setLocation(currentLocation);
          fetchAvailableRides(currentLocation);
          
          // After getting location, try to get the address
          reverseGeocode(currentLocation.latitude, currentLocation.longitude);
        },
        (error) => {
          console.error("Error getting location:", error);
          setError("Could not get your current location. Please enable location services.");
        }
      );
    } else {
      setError("Geolocation is not supported by this browser.");
    }
  }, [user]);

  const fetchAvailableRides = async (loc) => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await driverService.getAvailableRides(
        loc.latitude,
        loc.longitude
      );
      
      setAvailableRides(response.data || []);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load available rides');
      setLoading(false);
    }
  };

  const refreshLocationAndRides = async () => {
    setRefreshing(true);
    try {
      // Get current location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const newLocation = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            };
            setLocation(newLocation);
            
            // Update driver location in database
            await driverService.updateStatus(user.driver_id, 'available', newLocation);
            
            // Fetch available rides with new location
            await fetchAvailableRides(newLocation);
            
            // Try to get the address
            reverseGeocode(newLocation.latitude, newLocation.longitude);
            
            setRefreshing(false);
          },
          (error) => {
            console.error("Error getting location:", error);
            setError("Could not update your location. Please enable location services.");
            setRefreshing(false);
          }
        );
      } else {
        setError("Geolocation is not supported by this browser.");
        setRefreshing(false);
      }
    } catch (err) {
      console.error('Error refreshing location:', err);
      setError('Failed to refresh your location and available rides');
      setRefreshing(false);
    }
  };

  const handleSelectRide = (ride) => {
    console.log('Selected ride:', ride);
    setSelectedRide(ride);
    
    if (!ride.pickup_location || !ride.dropoff_location) {
      console.error('Missing location data in ride:', ride);
      setError('This ride has incomplete location data.');
      return;
    }

    const formattedRide = {
      ...ride,
      pickup_location: {
        latitude: ride.pickup_location.coordinates[1],
        longitude: ride.pickup_location.coordinates[0]
      },
      dropoff_location: {
        latitude: ride.dropoff_location.coordinates[1], 
        longitude: ride.dropoff_location.coordinates[0]
      }
    };
    
    setSelectedRide(formattedRide);
  };

  const handleAcceptRide = async () => {
  if (!selectedRide) return;

  if (driverStatus === 'offline') {
    setError("You are currently offline. Please go online to accept rides.");
    return;
  }
  
  // Check if user is offline
  if (user.status === 'offline') {
    setError("You are currently offline. Please go online to accept rides.");
    return;
  }
  
  // Check if ride is too far before trying to accept
  if (selectedRide.distance_to_pickup > 16) {
    setError("This ride is too far away to accept (more than 10 miles from your current location)");
    return;
  }
  
  try {
    setAccepting(true);
    console.log('Accepting ride:', selectedRide.ride_id);
    
    // Call the API to accept the ride
    const response = await driverService.acceptRide(selectedRide.ride_id);
    console.log('Ride accepted response:', response);
    
    // Get the updated driver profile to reflect new status
    await driverService.getProfile(user.driver_id);
    
    setAccepting(false);

    // Show success message
    alert('Ride accepted successfully! Navigating to active ride...');
    
    setTimeout(() => {
      navigate('/driver/rides/active');
    }, 500);
  } catch (err) {
    console.error('Error accepting ride:', err);
    let errorMessage = err.response?.data?.message || 'Failed to accept ride';
    
    // Check for specific error cases
    if (err.response?.data?.active_ride_id) {
      errorMessage = `You already have an active ride (#${err.response.data.active_ride_id}). Complete this ride before accepting a new one.`;
      
      // Option to navigate to the active ride
      if (confirm(`${errorMessage}\n\nDo you want to navigate to your active ride?`)) {
        navigate('/driver/rides/active');
        return;
      }
    } else if (err.response?.status === 403 || 
              (err.response?.data?.message && err.response.data.message.includes('offline'))) {
      errorMessage = "You must be online to accept rides. Please go online first.";
    } else if (err.response?.data?.message && err.response.data.message.includes('already been accepted')) {
      errorMessage = "This ride has already been accepted by another driver. Please refresh the list.";
      // Force refresh the list of available rides after a short delay
      setTimeout(() => {
        if (location) {
          fetchAvailableRides({
            latitude: location.latitude,
            longitude: location.longitude
          });
        }
      }, 1000);
    } else if (err.response?.data?.distance) {
      errorMessage = `You are ${err.response.data.distance} km away from the pickup location (maximum allowed is 16 km)`;
    }
    
    setError(errorMessage);
    setAccepting(false);
  }
};
  
  // Function to handle address form changes
  const handleAddressChange = (e) => {
    const { name, value } = e.target;
    setAddressForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  // Function to geocode an address using Nominatim
  const geocodeAddress = async (fullAddress) => {
    try {
      const encodedAddress = encodeURIComponent(fullAddress);
      
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&limit=1`,
        {
          headers: {
            'User-Agent': 'UberSimulationApp/1.0'
          }
        }
      );
      
      if (response.data && response.data.length > 0) {
        const result = response.data[0];
        return {
          latitude: parseFloat(result.lat),
          longitude: parseFloat(result.lon),
          displayName: result.display_name
        };
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error('Failed to geocode address');
    }
  };
  
  // Function for reverse geocoding (coordinates to address)
  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: {
            'User-Agent': 'UberSimulationApp/1.0'
          }
        }
      );
      
      if (response.data && response.data.address) {
        const addr = response.data.address;
        
        // Try to extract address components
        setAddressForm({
          address: [addr.house_number, addr.road, addr.neighbourhood].filter(Boolean).join(', ') || addr.display_name || '',
          city: addr.city || addr.town || addr.village || addr.county || '',
          state: addr.state || '',
          zip_code: addr.postcode || ''
        });
      }
    } catch (error) {
      console.error('Reverse geocoding error:', error);
    }
  };
  
  // Function to handle address update submission
  const handleUpdateAddress = async () => {
    try {
      setUpdatingAddress(true);
      setError(null);
      
      // Validate form fields
      if (!addressForm.address || !addressForm.city || !addressForm.state || !addressForm.zip_code) {
        setError('All address fields are required');
        setUpdatingAddress(false);
        return;
      }
      
      // Construct full address for geocoding
      const fullAddress = `${addressForm.address}, ${addressForm.city}, ${addressForm.state} ${addressForm.zip_code}`;
      
      // Geocode the address
      const coordinates = await geocodeAddress(fullAddress);
      if (!coordinates) {
        setError('Could not geocode the provided address');
        setUpdatingAddress(false);
        return;
      }
      
      // Update the location state
      setLocation({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      });
      
      // Call the service to update address
      await driverService.updateAddress(user.driver_id, addressForm);
      
      // Fetch available rides with the new location
      await fetchAvailableRides({
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      });
      
      setAddressFormOpen(false);
      setUpdatingAddress(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update location');
      setUpdatingAddress(false);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Available Rides</Typography>
        <Button 
          startIcon={<RefreshIcon />}
          onClick={refreshLocationAndRides}
          disabled={refreshing || loading}
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </Button>
      </Box>

      {/* Location Card with Address Form */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Your Location</Typography>
          <Button 
            startIcon={addressFormOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            onClick={() => setAddressFormOpen(!addressFormOpen)}
            color="primary"
          >
            {addressFormOpen ? "Hide Address Form" : "Update Address"}
          </Button>
        </Box>
        
        {/* Current Location Display */}
        <Typography variant="body1" gutterBottom>
          Current coordinates: {location ? 
            `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : 
            'Unknown'}
        </Typography>
        
        {/* Address Update Form */}
        <Collapse in={addressFormOpen}>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Street Address"
                  name="address"
                  value={addressForm.address}
                  onChange={handleAddressChange}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={5}>
                <TextField
                  fullWidth
                  label="City"
                  name="city"
                  value={addressForm.city}
                  onChange={handleAddressChange}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  label="State"
                  name="state"
                  value={addressForm.state}
                  onChange={handleAddressChange}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label="ZIP Code"
                  name="zip_code"
                  value={addressForm.zip_code}
                  onChange={handleAddressChange}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  onClick={handleUpdateAddress}
                  disabled={updatingAddress}
                  startIcon={<LocationIcon />}
                >
                  {updatingAddress ? <CircularProgress size={24} /> : 'Update Location'}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </Collapse>
      </Paper>

      {driverStatus === 'offline' && (
      <Alert severity="warning" sx={{ mb: 3 }}>
        You are currently offline. Go online in the sidebar to accept rides.
      </Alert>
    )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Ride Requests Near You
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {availableRides.length === 0 ? (
                <Typography>No ride requests available at the moment. Try refreshing later.</Typography>
              ) : (
                <List sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {availableRides.map((ride) => (
                    <ListItem 
                      key={ride.ride_id} 
                      divider
                      button
                      selected={selectedRide?.ride_id === ride.ride_id}
                      onClick={() => handleSelectRide(ride)}
                      sx={{ 
                        cursor: 'pointer',
                        bgcolor: selectedRide?.ride_id === ride.ride_id ? 'action.selected' : 'background.paper'
                      }}
                    >
                      <ListItemText
                        primary={`Ride #${ride.ride_id}`}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="textPrimary">
                              {new Date(ride.date_time).toLocaleString()}
                            </Typography>
                            <br />
                            {ride.distance_to_pickup > 16 && (
        <Typography component="span" variant="body2" color="error.main">
          Too far to accept!
        </Typography>
      )}                            <br />
                            {`Passengers: ${ride.passenger_count || 1}`}
                          </>
                        }
                      />
                      <ListItemSecondaryAction>
                        <Typography variant="h6" color="primary">
                          ${ride.fare_amount?.toFixed(2) || '0.00'}
                        </Typography>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}
            </Paper>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              {selectedRide ? (
                <>
                  <Typography variant="h6" gutterBottom>
                    Ride Details
                  </Typography>
                  <Divider sx={{ mb: 2 }} />
                  
                  <Box sx={{ mb: 3 }}>
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2">Pickup Location</Typography>
                        <Typography variant="body2">
                          {`${selectedRide.pickup_location.latitude.toFixed(4)}, ${selectedRide.pickup_location.longitude.toFixed(4)}`}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2">Drop-off Location</Typography>
                        <Typography variant="body2">
                          {`${selectedRide.dropoff_location.latitude.toFixed(4)}, ${selectedRide.dropoff_location.longitude.toFixed(4)}`}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2">Estimated Fare</Typography>
                        <Typography variant="body1" color="primary" sx={{ fontWeight: 'bold' }}>
                          ${selectedRide.fare_amount?.toFixed(2) || '0.00'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <Typography variant="subtitle2">Estimated Time</Typography>
                        <Typography variant="body2">
                          {selectedRide.duration ? `${Math.round(selectedRide.duration)} mins` : 'N/A'}
                        </Typography>
                      </Grid>
                      {selectedRide.customer_info && (
                        <Grid item xs={12}>
                          <Typography variant="subtitle2">Customer</Typography>
                          <Typography variant="body2">
                            {`${selectedRide.customer_info.first_name || ''} ${selectedRide.customer_info.last_name || ''}`}
                            {selectedRide.customer_info.rating && ` (Rating: ${selectedRide.customer_info.rating.toFixed(1)})`}
                          </Typography>
                        </Grid>
                      )}
                    </Grid>
                  </Box>
                  
                  <Box sx={{ height: 250, mb: 2 }}>
                    <MapWithMarkers
                      pickup={{
                        lat: selectedRide.pickup_location.latitude,
                        lng: selectedRide.pickup_location.longitude
                      }}
                      dropoff={{
                        lat: selectedRide.dropoff_location.latitude,
                        lng: selectedRide.dropoff_location.longitude
                      }}
                      showDirections={true}
                      height={250}
                      markers={location ? [
                        {
                          position: {
                            lat: location.latitude,
                            lng: location.longitude
                          },
                          title: 'Your Location'
                        }
                      ] : []}
                    />
                  </Box>
                  
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Button
                      variant="contained"
                      color="primary"
                      size="large"
                      onClick={handleAcceptRide}
                      disabled={accepting || user.status === 'offline' || selectedRide.distance_to_pickup > 16}
                      startIcon={<CarIcon />}
                    >
{accepting ? <CircularProgress size={24} /> : 
    (user.status === 'offline' ? 'Go Online to Accept' : 'Accept Ride')}                    
    </Button>
                  </Box>
                </>
              ) : (
                <Box sx={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  height: '100%',
                  minHeight: 300
                }}>
                  <Typography variant="h6" color="textSecondary" gutterBottom>
                    Select a ride to view details
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Click on a ride from the list to see more information
                  </Typography>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}

export default AvailableRides;