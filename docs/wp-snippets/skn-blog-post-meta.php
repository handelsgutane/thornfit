<?php
/**
 * Plugin Name: SkarpeKniver — Blog Post Meta
 * Description: Eksponerer skn_video_url og skn_related_product_ids på post-
 *              type slik at "Video"-varianten av artikkelsiden kan rendre
 *              pinned video-sidebar + relaterte-produkter-blokk.
 *
 * Plassering: lim inn i chef-mu-pluginen ELLER lagre som mu-plugin:
 *   wp-content/mu-plugins/skn-blog-post-meta.php
 *
 * WP-admin bruk:
 *   Innlegg → Rediger innlegg → "SkarpeKniver — artikkel-meta"-meta-boks i
 *   sidebar (eller Custom Fields om "Skjermalternativer" har det aktivert).
 *
 * Felt:
 *   - skn_video_url:           full YouTube/Vimeo-URL (én).
 *   - skn_related_product_ids: kommaseparert liste av produkt-IDer
 *                              (f.eks. "5149,5157,5161"). Maks 5 anbefalt.
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * 1) Registrer post-meta så feltene eksponeres i WP REST under post['meta'].
 */
add_action( 'init', function () {
    register_post_meta( 'post', 'skn_video_url', [
        'type'         => 'string',
        'description'  => 'YouTube/Vimeo-URL for pinned video-sidebar.',
        'single'       => true,
        'show_in_rest' => true,
        'auth_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
    ] );

    register_post_meta( 'post', 'skn_related_product_ids', [
        'type'         => 'string',
        'description'  => 'Kommaseparert liste av Woo product IDs.',
        'single'       => true,
        'show_in_rest' => true,
        'auth_callback' => function () {
            return current_user_can( 'edit_posts' );
        },
    ] );
} );

/**
 * 2) Klassisk meta-boks i editor-sidebar — synlig uten å skru på Custom Fields.
 */
add_action( 'add_meta_boxes', function () {
    add_meta_box(
        'skn_blog_post_meta',
        'SkarpeKniver — artikkel-meta',
        'skn_render_blog_post_meta_box',
        'post',
        'side',
        'default'
    );
} );

function skn_render_blog_post_meta_box( $post ) {
    wp_nonce_field( 'skn_blog_post_meta', 'skn_blog_post_meta_nonce' );

    $video_url   = get_post_meta( $post->ID, 'skn_video_url', true );
    $product_ids = get_post_meta( $post->ID, 'skn_related_product_ids', true );
    ?>
    <p>
        <label for="skn_video_url" style="display:block; font-weight:600; margin-bottom:4px;">
            Video-URL (YouTube/Vimeo)
        </label>
        <input
            type="url"
            id="skn_video_url"
            name="skn_video_url"
            value="<?php echo esc_attr( $video_url ); ?>"
            placeholder="https://youtube.com/watch?v=..."
            style="width:100%;"
        />
        <span class="description" style="display:block; margin-top:4px; font-size:11px; color:#666;">
            Vises som pinned sidebar på artikkelsiden. La stå tom for vanlig tekst-artikkel.
        </span>
    </p>
    <p>
        <label for="skn_related_product_ids" style="display:block; font-weight:600; margin-bottom:4px;">
            Relaterte produkt-IDer
        </label>
        <input
            type="text"
            id="skn_related_product_ids"
            name="skn_related_product_ids"
            value="<?php echo esc_attr( $product_ids ); ?>"
            placeholder="5149, 5157, 5161"
            style="width:100%;"
        />
        <span class="description" style="display:block; margin-top:4px; font-size:11px; color:#666;">
            Kommaseparert liste, maks 5. Vises som "Relaterte produkter"-blokk i artikkelen.
        </span>
    </p>
    <?php
}

/**
 * 3) Lagre verdiene ved post-update.
 */
add_action( 'save_post_post', function ( $post_id ) {
    if ( ! isset( $_POST['skn_blog_post_meta_nonce'] ) ) return;
    if ( ! wp_verify_nonce( wp_unslash( $_POST['skn_blog_post_meta_nonce'] ), 'skn_blog_post_meta' ) ) return;
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
    if ( ! current_user_can( 'edit_post', $post_id ) ) return;

    if ( isset( $_POST['skn_video_url'] ) ) {
        $url = trim( wp_unslash( $_POST['skn_video_url'] ) );
        if ( $url === '' ) {
            delete_post_meta( $post_id, 'skn_video_url' );
        } else {
            update_post_meta( $post_id, 'skn_video_url', esc_url_raw( $url ) );
        }
    }

    if ( isset( $_POST['skn_related_product_ids'] ) ) {
        $raw = trim( wp_unslash( $_POST['skn_related_product_ids'] ) );
        // Normaliser: kun tall, komma-separert, maks 10.
        $ids = array_filter( array_map( 'intval', explode( ',', $raw ) ) );
        $ids = array_slice( array_values( array_unique( $ids ) ), 0, 10 );
        if ( empty( $ids ) ) {
            delete_post_meta( $post_id, 'skn_related_product_ids' );
        } else {
            update_post_meta( $post_id, 'skn_related_product_ids', implode( ',', $ids ) );
        }
    }
} );
 