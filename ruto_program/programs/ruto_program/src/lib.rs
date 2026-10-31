//! ruto_program: profiles and sendable cards for Ruto.
//!
//! Every instruction is signed and paid for by one backend authority, so users
//! never touch keys. Only hashes, handles, counters and statuses live on chain.
//! Coordinates, place names and personal details stay in the backend database.

use anchor_lang::prelude::*;

// Placeholder id. Run `anchor keys sync` to replace it with your program's real key.
declare_id!("8P89qgZbZZYcwKe7NSa6F13LDeyk78dXWcYLUoEjrFF8");

pub const MIN_HANDLE_LEN: usize = 3;
pub const MAX_HANDLE_LEN: usize = 20;

#[program]
pub mod ruto_program {
    use super::*;

    /// Run once right after deploy. The signer becomes the only authority that can
    /// create profiles and send or resolve cards.
    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Creates a profile. The handle is the PDA seed, so a taken handle makes `init` fail.
    /// `data_hash` is a hash of the off-chain profile data, never the data itself.
    pub fn create_profile(
        ctx: Context<CreateProfile>,
        handle: String,
        avatar_id: u8,
        data_hash: [u8; 32],
    ) -> Result<()> {
        require!(is_valid_handle(&handle), RutoError::InvalidHandle);

        let profile_key = ctx.accounts.profile.key();
        let now = Clock::get()?.unix_timestamp;

        let profile = &mut ctx.accounts.profile;
        profile.handle = handle.clone();
        profile.avatar_id = avatar_id;
        profile.data_hash = data_hash;
        profile.inbox_count = 0;
        profile.sent_count = 0;
        profile.created_at = now;
        profile.bump = ctx.bumps.profile;

        emit!(ProfileCreated {
            profile: profile_key,
            handle,
        });
        Ok(())
    }

    /// Sends a route card. `route_hash` is the SHA-256 of the canonical route that the
    /// backend stores off chain. The recipient re-hashes it before accepting.
    pub fn send_route_card(mut ctx: Context<SendRouteCard>, route_hash: [u8; 32]) -> Result<()> {
        let accounts = &mut ctx.accounts;
        write_card(
            &mut accounts.card,
            &mut accounts.sender_profile,
            &mut accounts.recipient_profile,
            ctx.bumps.card,
            CardKind::Route,
            route_hash,
            Pubkey::default(),
        )
    }

    /// Sends a profile card that points at an existing profile (often the sender's own).
    pub fn send_profile_card(mut ctx: Context<SendProfileCard>) -> Result<()> {
        let shared = ctx.accounts.shared_profile.key();
        let accounts = &mut ctx.accounts;
        write_card(
            &mut accounts.card,
            &mut accounts.sender_profile,
            &mut accounts.recipient_profile,
            ctx.bumps.card,
            CardKind::Profile,
            [0u8; 32],
            shared,
        )
    }

    /// Accepts or declines a pending card. A card can only be resolved once.
    pub fn respond_card(ctx: Context<RespondCard>, accept: bool) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let card = &mut ctx.accounts.card;
        card.status = if accept {
            CardStatus::Accepted
        } else {
            CardStatus::Declined
        };
        card.resolved_at = now;

        emit!(CardResolved {
            card: card.key(),
            status: card.status,
        });
        Ok(())
    }
}

/// Shared by both send instructions. The new card takes the recipient's current
/// inbox_count as its index, then both counters move up by one.
fn write_card(
    card: &mut Account<Card>,
    sender: &mut Account<Profile>,
    recipient: &mut Account<Profile>,
    card_bump: u8,
    kind: CardKind,
    route_hash: [u8; 32],
    shared_profile: Pubkey,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    card.sender = sender.key();
    card.recipient = recipient.key();
    card.kind = kind;
    card.route_hash = route_hash;
    card.shared_profile = shared_profile;
    card.status = CardStatus::Pending;
    card.index = recipient.inbox_count;
    card.created_at = now;
    card.resolved_at = 0;
    card.bump = card_bump;

    recipient.inbox_count = recipient
        .inbox_count
        .checked_add(1)
        .ok_or(RutoError::Overflow)?;
    sender.sent_count = sender
        .sent_count
        .checked_add(1)
        .ok_or(RutoError::Overflow)?;

    emit!(CardSent {
        card: card.key(),
        sender: card.sender,
        recipient: card.recipient,
        kind,
        index: card.index,
    });
    Ok(())
}

/// 3 to 20 characters, only lowercase a-z, 0-9 and underscore.
pub fn is_valid_handle(handle: &str) -> bool {
    let len = handle.len();
    if !(MIN_HANDLE_LEN..=MAX_HANDLE_LEN).contains(&len) {
        return false;
    }
    handle
        .bytes()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Profile {
    #[max_len(20)]
    pub handle: String,
    pub avatar_id: u8,
    pub data_hash: [u8; 32],
    /// Cards received so far. Also the index of the next card sent to this profile.
    pub inbox_count: u32,
    pub sent_count: u32,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Card {
    /// Sender's Profile PDA.
    pub sender: Pubkey,
    /// Recipient's Profile PDA.
    pub recipient: Pubkey,
    pub kind: CardKind,
    /// SHA-256 of the canonical route. All zeros for profile cards.
    pub route_hash: [u8; 32],
    /// Profile being shared. Pubkey::default() for route cards.
    pub shared_profile: Pubkey,
    pub status: CardStatus,
    pub index: u32,
    pub created_at: i64,
    /// 0 until the card is accepted or declined.
    pub resolved_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CardKind {
    Route,
    Profile,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum CardStatus {
    Pending,
    Accepted,
    Declined,
}

// ---------------------------------------------------------------------------
// Instruction contexts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Config::INIT_SPACE,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(handle: String)]
pub struct CreateProfile<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RutoError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + Profile::INIT_SPACE,
        seeds = [b"profile", handle.as_bytes()],
        bump
    )]
    pub profile: Account<'info, Profile>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendRouteCard<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RutoError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub sender_profile: Account<'info, Profile>,
    #[account(
        mut,
        constraint = sender_profile.key() != recipient_profile.key() @ RutoError::SelfSend
    )]
    pub recipient_profile: Account<'info, Profile>,
    #[account(
        init,
        payer = authority,
        space = 8 + Card::INIT_SPACE,
        seeds = [b"card", recipient_profile.key().as_ref(), &recipient_profile.inbox_count.to_le_bytes()],
        bump
    )]
    pub card: Account<'info, Card>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SendProfileCard<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RutoError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub sender_profile: Account<'info, Profile>,
    #[account(
        mut,
        constraint = sender_profile.key() != recipient_profile.key() @ RutoError::SelfSend
    )]
    pub recipient_profile: Account<'info, Profile>,
    /// The profile being shared. Cannot be the recipient's own profile.
    #[account(
        constraint = shared_profile.key() != recipient_profile.key() @ RutoError::InvalidSharedProfile
    )]
    pub shared_profile: Account<'info, Profile>,
    #[account(
        init,
        payer = authority,
        space = 8 + Card::INIT_SPACE,
        seeds = [b"card", recipient_profile.key().as_ref(), &recipient_profile.inbox_count.to_le_bytes()],
        bump
    )]
    pub card: Account<'info, Card>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RespondCard<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
        has_one = authority @ RutoError::Unauthorized
    )]
    pub config: Account<'info, Config>,
    pub authority: Signer<'info>,
    /// Must be the recipient the card was addressed to: the card PDA is derived from it.
    pub recipient_profile: Account<'info, Profile>,
    #[account(
        mut,
        seeds = [b"card", recipient_profile.key().as_ref(), &card.index.to_le_bytes()],
        bump = card.bump,
        constraint = card.status == CardStatus::Pending @ RutoError::AlreadyResolved
    )]
    pub card: Account<'info, Card>,
}

// ---------------------------------------------------------------------------
// Events and errors
// ---------------------------------------------------------------------------

#[event]
pub struct ProfileCreated {
    pub profile: Pubkey,
    pub handle: String,
}

#[event]
pub struct CardSent {
    pub card: Pubkey,
    pub sender: Pubkey,
    pub recipient: Pubkey,
    pub kind: CardKind,
    pub index: u32,
}

#[event]
pub struct CardResolved {
    pub card: Pubkey,
    pub status: CardStatus,
}

#[error_code]
pub enum RutoError {
    #[msg("Signer is not the program authority")]
    Unauthorized,
    #[msg("Handle must be 3-20 characters: lowercase a-z, 0-9 or underscore")]
    InvalidHandle,
    #[msg("A card cannot be sent to yourself")]
    SelfSend,
    #[msg("This card was already accepted or declined")]
    AlreadyResolved,
    #[msg("Counter overflow")]
    Overflow,
    #[msg("A profile card cannot share the recipient's own profile")]
    InvalidSharedProfile,
}

// ---------------------------------------------------------------------------
// Unit tests (plain `cargo test`, no validator needed)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_handles() {
        for h in ["amos", "idorocodes", "a_b", "user_01", "abc", "007"] {
            assert!(is_valid_handle(h), "{h} should be valid");
        }
        assert!(is_valid_handle(&"a".repeat(MAX_HANDLE_LEN)));
    }

    #[test]
    fn rejects_bad_length() {
        assert!(!is_valid_handle(""));
        assert!(!is_valid_handle("ab"));
        assert!(!is_valid_handle(&"a".repeat(MAX_HANDLE_LEN + 1)));
    }

    #[test]
    fn rejects_bad_characters() {
        for h in ["Amos", "AMOS", "bad-name", "has space", "dot.dot", "émile", "tab\t"] {
            assert!(!is_valid_handle(h), "{h} should be invalid");
        }
    }

    #[test]
    fn account_sizes_match_the_layout() {
        // 32 authority + 1 bump
        assert_eq!(Config::INIT_SPACE, 33);
        // (4 + 20) handle + 1 avatar + 32 hash + 4 inbox + 4 sent + 8 created + 1 bump
        assert_eq!(Profile::INIT_SPACE, 74);
        // 32 + 32 + 1 kind + 32 hash + 32 shared + 1 status + 4 index + 8 + 8 + 1 bump
        assert_eq!(Card::INIT_SPACE, 151);
    }
}
