#include <stdbool.h>
#include <stddef.h>
#include <emscripten.h>

#include "libretro.h"

extern void retro_init(void);
extern void retro_deinit(void);
extern void retro_set_environment(retro_environment_t cb);
extern void retro_set_video_refresh(retro_video_refresh_t cb);
extern void retro_set_audio_sample(retro_audio_sample_t cb);
extern void retro_set_audio_sample_batch(retro_audio_sample_batch_t cb);
extern void retro_set_input_poll(retro_input_poll_t cb);
extern void retro_set_input_state(retro_input_state_t cb);
extern bool retro_load_game(const struct retro_game_info *info);
extern void retro_unload_game(void);
extern void retro_run(void);
extern void *retro_get_memory_data(unsigned id);
extern size_t retro_get_memory_size(unsigned id);
extern size_t retro_serialize_size(void);
extern bool retro_serialize(void *data, size_t size);
extern bool retro_unserialize(const void *data, size_t size);
extern char Mcd1Data[1024 * 8 * 16];
extern char Mcd2Data[1024 * 8 * 16];

EM_JS(bool, browser_environment, (unsigned cmd, void *data), {
  return typeof globalThis.frontendEnvironment === 'function' ? globalThis.frontendEnvironment(cmd, data) : false;
});

EM_JS(void, browser_video, (const void *data, unsigned width, unsigned height, size_t pitch), {
  if (typeof globalThis.frontendVideo === 'function') globalThis.frontendVideo(data, width, height, pitch);
});

EM_JS(void, browser_audio_sample, (int16_t left, int16_t right), {
  if (typeof globalThis.frontendAudioSample === 'function') globalThis.frontendAudioSample(left, right);
});

EM_JS(size_t, browser_audio_batch, (const int16_t *data, size_t frames), {
  return typeof globalThis.frontendAudioBatch === 'function' ? globalThis.frontendAudioBatch(data, frames) : frames;
});

EM_JS(void, browser_input_poll, (void), {
  if (typeof globalThis.frontendInputPoll === 'function') globalThis.frontendInputPoll();
});

EM_JS(int16_t, browser_input_state, (unsigned port, unsigned device, unsigned index, unsigned id), {
  return typeof globalThis.frontendInputState === 'function' ? globalThis.frontendInputState(port, device, index, id) : 0;
});

static bool environment_cb(unsigned cmd, void *data) { return browser_environment(cmd, data); }
static void video_cb(const void *data, unsigned width, unsigned height, size_t pitch) { browser_video(data, width, height, pitch); }
static void audio_sample_cb(int16_t left, int16_t right) { browser_audio_sample(left, right); }
static size_t audio_batch_cb(const int16_t *data, size_t frames) { return browser_audio_batch(data, frames); }
static void input_poll_cb(void) { browser_input_poll(); }
static int16_t input_state_cb(unsigned port, unsigned device, unsigned index, unsigned id) { return browser_input_state(port, device, index, id); }

void frontend_init(void) {
  retro_set_environment(environment_cb);
  retro_set_video_refresh(video_cb);
  retro_set_audio_sample(audio_sample_cb);
  retro_set_audio_sample_batch(audio_batch_cb);
  retro_set_input_poll(input_poll_cb);
  retro_set_input_state(input_state_cb);
  retro_init();
}

int frontend_load_game(const char *path) {
  struct retro_game_info info;
  info.path = path;
  info.data = NULL;
  info.size = 0;
  info.meta = NULL;
  return retro_load_game(&info) ? 1 : 0;
}

void frontend_run(void) { retro_run(); }
void frontend_unload_game(void) { retro_unload_game(); }
void frontend_deinit(void) { retro_deinit(); }

void *frontend_save_ram_ptr(void) { return retro_get_memory_data(0); }
size_t frontend_save_ram_size(void) { return retro_get_memory_size(0); }
void *frontend_memory_card_ptr(int card) { return card == 2 ? Mcd2Data : Mcd1Data; }
size_t frontend_memory_card_size(void) { return 1024 * 8 * 16; }
size_t frontend_serialize_size(void) { return retro_serialize_size(); }
int frontend_serialize(void *data, size_t size) { return retro_serialize(data, size) ? 1 : 0; }
int frontend_unserialize(const void *data, size_t size) { return retro_unserialize(data, size) ? 1 : 0; }
