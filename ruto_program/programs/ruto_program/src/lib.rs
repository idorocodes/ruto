pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9D2K6eAAjHUev8ztkQyoJF1a9TVjRXCwN9TCK3sWTuQT");

#[program]
pub mod ruto_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::handle_initialize(ctx)
    }

    pub fn create_profile(
        ctx: Context<Increment>,
        handle: String,
        avatar_id: u8,
        data_hash: [u8; 32],
    ) -> Result<()> {
        crate::instructions::create_profile::create_profile(ctx, handle, avatar_id, data_hash)
    }
}
