use std::sync::{Arc, Mutex};
use std::collections::VecDeque;
use rustfft::{FftPlanner, num_complex::Complex};
use realfft::{RealFftPlanner, RealToComplex};

/// Audio analyzer for real-time frequency and waveform analysis
pub struct AudioAnalyzer {
    sample_rate: u32,
    buffer_size: usize,
    fft_size: usize,
    
    // FFT components
    real_planner: RealFftPlanner<f32>,
    r2c: Arc<dyn RealToComplex<f32>>,
    
    // Buffers
    input_buffer: VecDeque<f32>,
    fft_input: Vec<f32>,
    fft_output: Vec<Complex<f32>>,
    
    // Analysis results
    frequency_bins: Vec<f32>,
    waveform_data: Vec<f32>,
    
    // Smoothing
    smoothing_factor: f32,
    previous_spectrum: Vec<f32>,
}

impl AudioAnalyzer {
    /// Create a new audio analyzer
    pub fn new(sample_rate: u32, buffer_size: usize) -> Self {
        let fft_size = buffer_size.next_power_of_two();
        
        let mut real_planner = RealFftPlanner::<f32>::new();
        let r2c = real_planner.plan_fft_forward(fft_size);
        
        let mut analyzer = Self {
            sample_rate,
            buffer_size,
            fft_size,
            real_planner,
            r2c,
            input_buffer: VecDeque::with_capacity(buffer_size * 2),
            fft_input: vec![0.0; fft_size],
            fft_output: vec![Complex::new(0.0, 0.0); fft_size / 2 + 1],
            frequency_bins: vec![0.0; fft_size / 2],
            waveform_data: vec![0.0; buffer_size],
            smoothing_factor: 0.8,
            previous_spectrum: vec![0.0; fft_size / 2],
        };
        
        analyzer
    }
    
    /// Process audio samples and update analysis data
    pub fn process_samples(&mut self, samples: &[f32]) {
        // Add samples to input buffer
        for &sample in samples {
            self.input_buffer.push_back(sample);
        }
        
        // Keep buffer size manageable
        while self.input_buffer.len() > self.buffer_size * 2 {
            self.input_buffer.pop_front();
        }
        
        // Update waveform data
        self.update_waveform();
        
        // Perform FFT analysis if we have enough samples
        if self.input_buffer.len() >= self.fft_size {
            self.perform_fft_analysis();
        }
    }
    
    /// Update waveform data from recent samples
    fn update_waveform(&mut self) {
        let start_idx = if self.input_buffer.len() >= self.buffer_size {
            self.input_buffer.len() - self.buffer_size
        } else {
            0
        };
        
        for (i, &sample) in self.input_buffer.iter().skip(start_idx).enumerate() {
            if i < self.waveform_data.len() {
                self.waveform_data[i] = sample;
            }
        }
        
        // Fill remaining with zeros if not enough samples
        for i in (self.input_buffer.len() - start_idx)..self.waveform_data.len() {
            self.waveform_data[i] = 0.0;
        }
    }
    
    /// Perform FFT analysis on the input buffer
    fn perform_fft_analysis(&mut self) {
        // Copy samples to FFT input buffer
        let start_idx = self.input_buffer.len() - self.fft_size;
        for (i, &sample) in self.input_buffer.iter().skip(start_idx).enumerate() {
            self.fft_input[i] = sample;
        }
        
        // Apply window function (Hann window)
        self.apply_window();
        
        // Perform FFT
        self.r2c.process(&mut self.fft_input, &mut self.fft_output).unwrap();
        
        // Convert to magnitude spectrum
        for (i, &complex_val) in self.fft_output.iter().enumerate() {
            if i < self.frequency_bins.len() {
                let magnitude = complex_val.norm();
                
                // Apply smoothing
                self.frequency_bins[i] = self.smoothing_factor * self.previous_spectrum[i] 
                    + (1.0 - self.smoothing_factor) * magnitude;
                
                self.previous_spectrum[i] = self.frequency_bins[i];
            }
        }
        
        // Normalize spectrum
        self.normalize_spectrum();
    }
    
    /// Apply Hann window to reduce spectral leakage
    fn apply_window(&mut self) {
        for (i, sample) in self.fft_input.iter_mut().enumerate() {
            let window_val = 0.5 * (1.0 - (2.0 * std::f32::consts::PI * i as f32 / (self.fft_size - 1) as f32).cos());
            *sample *= window_val;
        }
    }
    
    /// Normalize spectrum values to 0-1 range
    fn normalize_spectrum(&mut self) {
        let max_val = self.frequency_bins.iter().fold(0.0f32, |acc, &x| acc.max(x));
        
        if max_val > 0.0 {
            for bin in &mut self.frequency_bins {
                *bin /= max_val;
            }
        }
    }
    
    /// Get current frequency spectrum data
    pub fn get_frequency_spectrum(&self) -> &[f32] {
        &self.frequency_bins
    }
    
    /// Get current waveform data
    pub fn get_waveform(&self) -> &[f32] {
        &self.waveform_data
    }
    
    /// Get frequency for a given bin index
    pub fn get_frequency_for_bin(&self, bin_index: usize) -> f32 {
        (bin_index as f32 * self.sample_rate as f32) / (2.0 * self.frequency_bins.len() as f32)
    }
    
    /// Set smoothing factor (0.0 = no smoothing, 1.0 = maximum smoothing)
    pub fn set_smoothing_factor(&mut self, factor: f32) {
        self.smoothing_factor = factor.clamp(0.0, 1.0);
    }
    
    /// Get current smoothing factor
    pub fn get_smoothing_factor(&self) -> f32 {
        self.smoothing_factor
    }
    
    /// Reset analyzer state
    pub fn reset(&mut self) {
        self.input_buffer.clear();
        self.fft_input.fill(0.0);
        self.fft_output.fill(Complex::new(0.0, 0.0));
        self.frequency_bins.fill(0.0);
        self.waveform_data.fill(0.0);
        self.previous_spectrum.fill(0.0);
    }
    
    /// Get analyzer statistics
    pub fn get_stats(&self) -> AnalyzerStats {
        let rms = self.calculate_rms();
        let peak = self.calculate_peak();
        let spectral_centroid = self.calculate_spectral_centroid();
        
        AnalyzerStats {
            rms,
            peak,
            spectral_centroid,
            buffer_fill: self.input_buffer.len() as f32 / self.buffer_size as f32,
        }
    }
    
    /// Calculate RMS (Root Mean Square) of current waveform
    fn calculate_rms(&self) -> f32 {
        let sum_squares: f32 = self.waveform_data.iter().map(|&x| x * x).sum();
        (sum_squares / self.waveform_data.len() as f32).sqrt()
    }
    
    /// Calculate peak amplitude of current waveform
    fn calculate_peak(&self) -> f32 {
        self.waveform_data.iter().fold(0.0f32, |acc, &x| acc.max(x.abs()))
    }
    
    /// Calculate spectral centroid (brightness measure)
    fn calculate_spectral_centroid(&self) -> f32 {
        let mut weighted_sum = 0.0;
        let mut magnitude_sum = 0.0;
        
        for (i, &magnitude) in self.frequency_bins.iter().enumerate() {
            let frequency = self.get_frequency_for_bin(i);
            weighted_sum += frequency * magnitude;
            magnitude_sum += magnitude;
        }
        
        if magnitude_sum > 0.0 {
            weighted_sum / magnitude_sum
        } else {
            0.0
        }
    }
}

/// Statistics about the current audio analysis
#[derive(Debug, Clone)]
pub struct AnalyzerStats {
    pub rms: f32,
    pub peak: f32,
    pub spectral_centroid: f32,
    pub buffer_fill: f32,
}

/// Visualization data for frontend
#[derive(Debug, Clone, serde::Serialize)]
pub struct VisualizationData {
    pub frequency_spectrum: Vec<f32>,
    pub waveform: Vec<f32>,
    pub stats: VisualizationStats,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct VisualizationStats {
    pub rms: f32,
    pub peak: f32,
    pub spectral_centroid: f32,
}

impl From<AnalyzerStats> for VisualizationStats {
    fn from(stats: AnalyzerStats) -> Self {
        Self {
            rms: stats.rms,
            peak: stats.peak,
            spectral_centroid: stats.spectral_centroid,
        }
    }
}
