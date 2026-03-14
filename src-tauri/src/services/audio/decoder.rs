//! Audio decoding helpers for Symphonia primary decoding with optional APE fallback.

use std::fs::File;
use std::path::Path;

use anyhow::{Context, Result, anyhow};
use rodio::buffer::SamplesBuffer;
use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

/// Decoded audio data ready to be appended to a Rodio sink.
#[allow(dead_code)]
#[derive(Debug)]
pub struct DecodedAudio {
    pub buffer: SamplesBuffer,
    pub duration: Option<u64>,
    pub sample_rate: u32,
    pub channels: u16,
}

/// Decode an audio file into an interleaved f32 buffer that Rodio can play.
pub fn decode_audio(path: &Path) -> Result<DecodedAudio> {
    if path
        .extension()
        .and_then(|s| s.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("ape"))
        .unwrap_or(false)
    {
        return Err(anyhow!(
            "APE format is currently unsupported. Consider converting '{}' to a supported format.",
            path.display()
        ));
    }

    decode_with_symphonia(path)
}

fn decode_with_symphonia(path: &Path) -> Result<DecodedAudio> {
    let file = File::open(path)
        .with_context(|| format!("Failed to open audio file {}", path.display()))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|ext| ext.to_str()) {
        hint.with_extension(extension);
    }

    let format_opts = FormatOptions::default();
    let metadata_opts = MetadataOptions::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &format_opts, &metadata_opts)
        .map_err(|err| anyhow!("Failed to probe format for {}: {}", path.display(), err))?;

    let mut format = probed.format;

    let track = format
        .default_track()
        .ok_or_else(|| anyhow!("No supported audio track found for {}", path.display()))?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|err| anyhow!("Failed to create decoder for {}: {}", path.display(), err))?;

    let mut sample_rate = codec_params
        .sample_rate
        .ok_or_else(|| anyhow!("Missing sample rate information for {}", path.display()))?;
    let mut channels = codec_params
        .channels
        .ok_or_else(|| anyhow!("Missing channel information for {}", path.display()))?
        .count() as u16;

    let duration = codec_params
        .n_frames
        .filter(|frames| *frames > 0)
        .map(|frames| frames / sample_rate as u64);

    let mut samples: Vec<f32> = Vec::new();
    let mut sample_buf: Option<SampleBuffer<f32>> = None;

    loop {
        match format.next_packet() {
            Ok(packet) => {
                if packet.track_id() != track_id {
                    continue;
                }

                let decoded = match decoder.decode(&packet) {
                    Ok(decoded) => decoded,
                    Err(SymphoniaError::IoError(err))
                        if err.kind() == std::io::ErrorKind::UnexpectedEof =>
                    {
                        break;
                    }
                    Err(SymphoniaError::DecodeError(err)) => {
                        return Err(anyhow!("Decode error for {}: {}", path.display(), err));
                    }
                    Err(SymphoniaError::ResetRequired) => {
                        sample_buf = None;
                        decoder = symphonia::default::get_codecs()
                            .make(&codec_params, &DecoderOptions::default())
                            .map_err(|err| {
                                anyhow!("Failed to reset decoder for {}: {}", path.display(), err)
                            })?;
                        continue;
                    }
                    Err(err) => {
                        return Err(anyhow!("Symphonia error for {}: {}", path.display(), err));
                    }
                };

                let spec = *decoded.spec();
                sample_rate = spec.rate;
                channels = spec.channels.count() as u16;

                let mut sample_buffer = sample_buf.take().unwrap_or_else(|| {
                    SampleBuffer::<f32>::new(decoded.capacity() as u64, *decoded.spec())
                });
                sample_buffer.copy_interleaved_ref(decoded);
                samples.extend_from_slice(sample_buffer.samples());
                sample_buf = Some(sample_buffer);
            }
            Err(SymphoniaError::IoError(err))
                if err.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(err) => {
                return Err(anyhow!(
                    "Error reading packets for {}: {}",
                    path.display(),
                    err
                ));
            }
        }
    }

    if samples.is_empty() {
        return Err(anyhow!("Decoded zero samples for {}", path.display()));
    }

    let channels_nz = std::num::NonZeroU16::new(channels).ok_or_else(|| {
        anyhow!(
            "Invalid channel count (0) while decoding {}",
            path.display()
        )
    })?;
    let sample_rate_nz = std::num::NonZeroU32::new(sample_rate)
        .ok_or_else(|| anyhow!("Invalid sample rate (0) while decoding {}", path.display()))?;

    let sample_count = samples.len() as u64;
    let buffer = SamplesBuffer::new(channels_nz, sample_rate_nz, samples);

    let duration = duration.or_else(|| {
        let frames = sample_count / u64::from(channels_nz.get());
        Some(frames / u64::from(sample_rate_nz.get()))
    });

    Ok(DecodedAudio {
        buffer,
        duration,
        sample_rate,
        channels,
    })
}
