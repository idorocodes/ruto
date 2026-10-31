use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Profile},
};

#[derive(Accounts)]
#[instruction(handle:String)]
pub struct Increment<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub protocol: Account<'info, Config>,
    #[account(init, payer = signer, space = 8 + Profile::INIT_SPACE,
    seeds = [PROFILE_SEED,handle.as_bytes()],
    bump)]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

pub fn create_profile(
    ctx: Context<Increment>,
    handle: String,
    avatar_id: u8,
    data_hash: [u8; 32],
) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.protocol.authority,
        ctx.accounts.signer.key(),
        ErrorCode::Unauthorized,
    );

    require!(handle.len() > 0, ErrorCode::FieldsNotSupplied);
    require!(avatar_id == 0, ErrorCode::FieldsNotSupplied);
    require!(data_hash.is_empty(), ErrorCode::FieldsNotSupplied);

    ctx.accounts.profile.set_inner(Profile {
        handle,
        avatar_id,
        data_hash,
        inbox_count: 0,
        sent_count: 0,
        created_at: Clock::get()?.unix_timestamp,
        bumb: ctx.bumps.profile,
    });

    Ok(())
}
